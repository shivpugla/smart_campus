import { GoogleGenAI } from '@google/genai';
import { getRoutingGuideText, VALID_CATEGORIES, VALID_DEPARTMENTS, ROUTING_GUIDE } from './routing-guide.js';
import fs from 'fs';
import path from 'path';

// Circuit breaker state
let geminiBlockedUntil = 0;
let geminiLastError = null;

// Helper to check for a valid Google AI Studio key format
function getApiKey() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!key || key.trim() === '' || key.length < 15) {
    return null;
  }
  return key.trim();
}

export function isGeminiConfigured() {
  return getApiKey() !== null;
}

export function getGeminiStatus() {
  const key = getApiKey();
  const configured = key !== null;
  const isRateLimited = Date.now() < geminiBlockedUntil;
  return {
    configured,
    isRateLimited,
    lastError: geminiLastError,
    model: 'gemini-3.8-flash'
  };
}

// ── JSON Schema for structured ticket output ────────────────────────────────
const ticketAnalysisSchema = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "A clear, concise 1-2 sentence summary of the complaint"
    },
    category: {
      type: "string",
      description: "The complaint category from the routing guide",
      enum: VALID_CATEGORIES
    },
    department: {
      type: "string",
      description: "The responsible department from the routing guide",
      enum: VALID_DEPARTMENTS
    },
    priority: {
      type: "string",
      description: "Priority level based on urgency and safety impact",
      enum: ["low", "medium", "high", "critical"]
    },
    missing_info: {
      type: "string",
      description: "Any important information that is missing from the complaint that would help resolve it. Empty string if complaint is complete."
    },
    key_details: {
      type: "string",
      description: "Extracted key details: what the issue is, specific location details, how long it has been an issue, severity"
    },
    suggested_action: {
      type: "string",
      description: "Recommended immediate action for the maintenance team"
    }
  },
  required: ["summary", "category", "department", "priority", "missing_info", "key_details", "suggested_action"]
};

// Helper to wrap promises with strict timeout
function withTimeout(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`AI_TIMEOUT_${ms}ms`)), ms))
  ]);
}

// ── Analyze a complaint with Gemini (with fallback) ─────────────────────────
export async function analyzeComplaint(complaintText, location, photoPath = null) {
  const apiKey = getApiKey();

  // If no valid key is configured or rate-limited, use instant smart rule engine
  if (!apiKey || Date.now() < geminiBlockedUntil) {
    return {
      success: true,
      mode: 'heuristic',
      analysis: fallbackAnalysis(complaintText, location)
    };
  }

  const client = new GoogleGenAI({ apiKey });
  const routingGuide = getRoutingGuideText();

  const systemInstruction = `You are CampusConnect AI — an expert campus maintenance complaint analyzer.
Your job is to:
1. Understand the student's complaint, even if it's informal, vague, or contains slang.
2. Summarize it into a clear, professional issue description (1-2 sentences).
3. Classify it into the correct category and route it to the right department using the routing guide below.
4. Assess priority (low/medium/high/critical) based on safety risk, number of people affected, and urgency:
   - CRITICAL: Safety hazards, fire risks, flooding, exposed wiring, sparks, structural collapse risk
   - HIGH: Major disruption affecting many people, broken essential services (no water, power outage)
   - MEDIUM: Moderate inconvenience, broken equipment affecting a room or area
   - LOW: Minor cosmetic issues, non-urgent requests, minor wear and tear
5. Identify any missing information that would help resolve the issue faster.
6. Suggest an immediate action for the maintenance team.

${routingGuide}`;

  const inputParts = [];

  // Add photo if provided
  if (photoPath && fs.existsSync(photoPath)) {
    try {
      const imageData = fs.readFileSync(photoPath);
      const base64Image = imageData.toString('base64');
      const ext = path.extname(photoPath).toLowerCase();
      const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
      const mimeType = mimeMap[ext] || 'image/jpeg';

      inputParts.push({
        inlineData: { data: base64Image, mimeType }
      });
    } catch (err) {
      console.error('Error reading image for AI analysis:', err.message);
    }
  }

  inputParts.push({
    text: `COMPLAINT: ${complaintText}\nLOCATION: ${location}\n\nAnalyze this campus maintenance complaint. Output strict JSON matching the required schema.`
  });

  try {
    const callPromise = client.interactions.create({
      model: "gemini-3.8-flash",
      input: inputParts.length === 1 ? inputParts[0].text : inputParts,
      system_instruction: systemInstruction,
      store: false,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: ticketAnalysisSchema
      }
    });

    const interaction = await withTimeout(callPromise, 6000);
    const result = JSON.parse(interaction.output_text);

    return {
      success: true,
      mode: 'gemini',
      analysis: result
    };
  } catch (error) {
    geminiLastError = error.message;
    if (error.message.includes('429') || error.message.includes('quota') || error.message.includes('RATE_LIMIT')) {
      geminiBlockedUntil = Date.now() + 60000;
      console.warn(`[Gemini AI] Rate limit / quota reached. Switching to instant rule engine for 60s.`);
    } else {
      console.warn(`[Gemini AI] Call skipped (${error.message}). Using instant rule engine.`);
    }

    return {
      success: true,
      mode: 'heuristic',
      analysis: fallbackAnalysis(complaintText, location)
    };
  }
}

// ── Check for duplicate tickets ─────────────────────────────────────────────
export async function checkDuplicates(complaintText, location, existingTickets) {
  if (!existingTickets || existingTickets.length === 0) {
    return { duplicates: [] };
  }

  const apiKey = getApiKey();

  // If Gemini key is available and not in cooldown, attempt Gemini-powered semantic duplicate detection
  if (apiKey && Date.now() >= geminiBlockedUntil) {
    try {
      const ticketSummaries = existingTickets.map(t =>
        `[ID: ${t.ticket_number}] Category: ${t.ai_category || 'N/A'} | Location: ${t.location} | Summary: ${t.ai_summary || t.complaint_text.substring(0, 100)}`
      ).join('\n');

      const prompt = `You are a duplicate detection system for campus maintenance complaints.

EXISTING OPEN TICKETS:
${ticketSummaries}

NEW COMPLAINT: "${complaintText}"
NEW LOCATION: "${location}"

Compare the new complaint to existing tickets. Identify any tickets that report the SAME issue.
Return a JSON array of duplicates with ticket_number, similarity_score (>= 0.6), and reason. If none, return empty array.`;

      const duplicateSchema = {
        type: "object",
        properties: {
          duplicates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                ticket_number: { type: "string" },
                similarity_score: { type: "number" },
                reason: { type: "string" }
              },
              required: ["ticket_number", "similarity_score", "reason"]
            }
          }
        },
        required: ["duplicates"]
      };

      const client = new GoogleGenAI({ apiKey });
      const callPromise = client.interactions.create({
        model: "gemini-3.8-flash",
        input: prompt,
        store: false,
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: duplicateSchema
        }
      });

      const interaction = await withTimeout(callPromise, 5000);
      return JSON.parse(interaction.output_text);
    } catch (err) {
      if (err.message.includes('429') || err.message.includes('quota')) {
        geminiBlockedUntil = Date.now() + 60000;
      }
    }
  }

  // Fast heuristic duplicate matching
  return heuristicDuplicateCheck(complaintText, location, existingTickets);
}

// ── Heuristic Duplicate Matcher ─────────────────────────────────────────────
function heuristicDuplicateCheck(complaintText, location, existingTickets) {
  const normText = complaintText.toLowerCase();
  const normLoc = location.toLowerCase();
  const duplicates = [];

  const getTokens = (str) => {
    return new Set(
      str.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !['the','and','for','with','this','that','from','have','been','there','near','room','floor','block'].includes(w))
    );
  };

  const textTokens = getTokens(normText);
  const locTokens = getTokens(normLoc);

  for (const ticket of existingTickets) {
    const tText = (ticket.complaint_text + ' ' + (ticket.ai_summary || '')).toLowerCase();
    const tLoc = (ticket.location || '').toLowerCase();

    const tTextTokens = getTokens(tText);
    const tLocTokens = getTokens(tLoc);

    // Calculate location overlap
    let locOverlap = 0;
    for (const token of locTokens) {
      if (tLocTokens.has(token)) locOverlap++;
    }
    const locScore = locTokens.size > 0 ? (locOverlap / Math.min(locTokens.size, tLocTokens.size || 1)) : 0;

    // Calculate text overlap (Jaccard)
    let textOverlap = 0;
    for (const token of textTokens) {
      if (tTextTokens.has(token)) textOverlap++;
    }
    const textScore = textTokens.size > 0 ? (textOverlap / Math.min(textTokens.size, tTextTokens.size || 1)) : 0;

    // Combined score
    const combinedScore = (locScore * 0.55) + (textScore * 0.45);

    if (combinedScore >= 0.50) {
      let reason = 'Similar issue reported in a nearby or matching location.';
      if (locScore > 0.6 && textScore > 0.4) {
        reason = `Matching location (${ticket.location}) and similar issue description.`;
      } else if (locScore > 0.7) {
        reason = `Same campus area (${ticket.location}) with pending maintenance ticket.`;
      } else {
        reason = `High semantic similarity with open ticket ${ticket.ticket_number}.`;
      }

      duplicates.push({
        ticket_number: ticket.ticket_number,
        similarity_score: Math.min(0.96, Math.round(combinedScore * 100) / 100),
        reason
      });
    }
  }

  duplicates.sort((a, b) => b.similarity_score - a.similarity_score);
  return { duplicates: duplicates.slice(0, 3) };
}

// ── Fallback intelligent analysis (rule engine) ─────────────────────────────
export function fallbackAnalysis(complaintText, location) {
  const text = complaintText.toLowerCase();

  // Category definitions with weighted problem keywords (action verbs & nouns)
  const categoryDefinitions = [
    {
      category: "Plumbing & Water",
      department: "Plumbing & Water",
      highWeight: ["water", "leak", "leaking", "drip", "dripping", "pipe", "pipes", "toilet", "toilets", "sink", "faucet", "tap", "drain", "drainage", "clog", "clogged", "flooding", "flood", "sewage", "restroom", "flush", "puddle"],
      normalWeight: ["bathroom", "washroom", "pooling", "overflowing", "spill"]
    },
    {
      category: "Electrical & Lighting",
      department: "Electrical & Lighting",
      highWeight: ["spark", "sparks", "smoke", "fire", "shock", "shocking", "electric", "electrical", "outlet", "socket", "light", "lights", "bulb", "bulbs", "fan", "ceiling fan", "wiring", "short circuit", "blackout", "fuse", "flicker", "flickering"],
      normalWeight: ["switch", "power", "plug", "dark", "illumination"]
    },
    {
      category: "HVAC & Climate",
      department: "HVAC & Climate Control",
      highWeight: ["ac", "air conditioner", "air conditioning", "hvac", "heating", "heater", "thermostat", "cooling", "freezing", "hot", "chilly", "humid", "vent", "ventilation", "exhaust"],
      normalWeight: ["airflow", "condenser", "filter", "stuffy"]
    },
    {
      category: "Cleaning & Sanitation",
      department: "Housekeeping & Sanitation",
      highWeight: ["dirty", "trash", "garbage", "bin", "bins", "smell", "stink", "odor", "cockroach", "roach", "rat", "mice", "pest", "mold", "mould", "dusty", "sanitation", "unhygienic", "infestation"],
      normalWeight: ["clean", "spill", "mess", "waste", "filthy"]
    },
    {
      category: "IT & Network",
      department: "IT & Network Services",
      highWeight: ["wifi", "wi-fi", "internet", "ethernet", "router", "network", "lan", "projector", "smartboard", "hdmi", "cable", "printer", "printing"],
      normalWeight: ["screen", "display", "monitor", "connection", "login"]
    },
    {
      category: "Safety & Security",
      department: "Safety & Security",
      highWeight: ["lock", "unlocked", "key", "cctv", "camera", "fire extinguisher", "alarm", "theft", "stolen", "vandalism", "shattered glass", "emergency exit", "trespass", "hazard", "unsafe"],
      normalWeight: ["security", "guard", "door lock", "broken latch"]
    },
    {
      category: "Grounds & Outdoor",
      department: "Grounds & Landscaping",
      highWeight: ["pothole", "parking lot", "sidewalk", "pavement", "grass", "lawn", "tree", "branch", "garden", "outdoor", "walkway", "pathway", "streetlight", "fence", "gate"],
      normalWeight: ["bench", "leaves", "exterior", "road"]
    },
    {
      category: "Furniture & Equipment",
      department: "Furniture & Equipment",
      highWeight: ["chair", "chairs", "desk", "desks", "table", "tables", "whiteboard", "blackboard", "podium", "shelf", "bookshelf", "cabinet", "locker", "bench", "drawer", "furniture"],
      normalWeight: ["wobbly", "broken leg", "cushion", "seat"]
    },
    {
      category: "Structural & Building",
      department: "General Maintenance",
      highWeight: ["wall", "ceiling", "floor", "door", "window", "roof", "crack", "cracks", "tiles", "plaster", "stair", "stairs", "railing", "elevator", "lift", "paint peeling"],
      normalWeight: ["building", "structure", "hinge", "handle"]
    }
  ];

  let bestCategory = "Structural & Building";
  let bestDepartment = "General Maintenance";
  let maxScore = -1;

  for (const item of categoryDefinitions) {
    let score = 0;
    for (const kw of item.highWeight) {
      if (text.includes(kw)) score += 3;
    }
    for (const kw of item.normalWeight) {
      if (text.includes(kw)) score += 1;
    }
    if (score > maxScore) {
      maxScore = score;
      bestCategory = item.category;
      bestDepartment = item.department;
    }
  }

  // Determine priority
  let priority = "medium";
  const criticalWords = [
    'spark', 'sparks', 'fire', 'smoke', 'shock', 'electrocute', 'explosion', 'gas leak',
    'flooding', 'flood', 'collapse', 'falling', 'urgent', 'emergency', 'danger', 'hazard',
    'live wire', 'open wire', 'trapped', 'shattered glass'
  ];
  const highWords = [
    'leak', 'leaking', 'dripping', 'pouring', 'no water', 'no power', 'blackout', 'outage',
    'broken lock', 'cctv down', 'freezing', 'extreme heat', 'unusable', 'overflowing',
    'pest infestation', 'vibrating violently', 'screeching'
  ];
  const lowWords = [
    'scratch', 'minor', 'cosmetic', 'paint scuff', 'loose screw', 'creaking', 'poster',
    'request for extra', 'notice board', 'stain on carpet'
  ];

  if (criticalWords.some(w => text.includes(w))) {
    priority = "critical";
  } else if (highWords.some(w => text.includes(w))) {
    priority = "high";
  } else if (lowWords.some(w => text.includes(w))) {
    priority = "low";
  }

  // Missing info detection
  const missingParts = [];
  const hasRoomNumber = /\b(room|hall|lab|rm|class|cabin)\s*#?\s*\d+/i.test(location) || /\b\d{3,4}\b/.test(location);
  const hasFloor = /\b(ground|1st|2nd|3rd|4th|5th|floor|basement)\b/i.test(location);

  if (!hasRoomNumber && !location.toLowerCase().includes('outdoor') && !location.toLowerCase().includes('parking')) {
    missingParts.push("Specific room/lab number");
  }
  if (!hasFloor && !location.toLowerCase().includes('outdoor') && !location.toLowerCase().includes('parking')) {
    missingParts.push("Floor level");
  }
  if ((text.includes('leak') || text.includes('water')) && !text.includes('actively') && !text.includes('dripping') && !text.includes('puddle')) {
    missingParts.push("Whether water is actively dripping");
  }
  if (!text.includes('today') && !text.includes('yesterday') && !text.includes('days') && !text.includes('week') && !text.includes('since')) {
    missingParts.push("Approximate duration of problem");
  }

  const missingInfo = missingParts.length > 0
    ? `Help us resolve faster by providing: ${missingParts.slice(0, 2).join(', ')}.`
    : '';

  // Clean summary
  let cleanSummary = complaintText.trim().replace(/\s+/g, ' ');
  if (cleanSummary.length > 130) {
    const cut = cleanSummary.substring(0, 130);
    const lastPunct = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf(';'), cut.lastIndexOf(','));
    cleanSummary = (lastPunct > 50 ? cut.substring(0, lastPunct) : cut) + '...';
  }
  cleanSummary = cleanSummary.charAt(0).toUpperCase() + cleanSummary.slice(1);

  // Suggested action
  let suggestedAction = "Dispatch maintenance technician for on-site assessment.";
  if (priority === 'critical') {
    suggestedAction = `Immediate dispatch: Secure area at ${location} and deploy ${bestDepartment} emergency response.`;
  } else if (bestCategory === 'Plumbing & Water') {
    suggestedAction = `Deploy plumbing crew to inspect line valves and prevent moisture damage at ${location}.`;
  } else if (bestCategory === 'Electrical & Lighting') {
    suggestedAction = `Schedule licensed electrician to test circuits and replace faulty components in ${location}.`;
  } else if (bestCategory === 'HVAC & Climate') {
    suggestedAction = `Inspect temperature sensor and airflow in ${location}; service compressor coils.`;
  } else if (bestCategory === 'IT & Network') {
    suggestedAction = `Verify network switch port status and test signal strength at ${location}.`;
  }

  return {
    summary: `${bestCategory} issue: ${cleanSummary}`,
    category: bestCategory,
    department: bestDepartment,
    priority,
    missing_info: missingInfo,
    key_details: `Category: ${bestCategory}. Location: ${location}. Priority: ${priority.toUpperCase()}.`,
    suggested_action: suggestedAction
  };
}
