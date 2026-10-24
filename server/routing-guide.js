// ── Routing Guide: Category → Department mapping ────────────────────────────
// This guide is fed to Gemini to classify complaints and route them to the
// correct department. It also contains keywords and example phrases.

export const ROUTING_GUIDE = {
  categories: [
    {
      category: "Structural & Building",
      department: "General Maintenance",
      keywords: ["wall", "ceiling", "floor", "door", "window", "roof", "crack", "broken", "damaged", "paint", "peeling", "tiles", "stairs", "railing", "handrail"],
      examples: [
        "There's a crack in the classroom wall",
        "The door handle is broken in Room 201",
        "Ceiling tiles are falling in the library",
        "Paint is peeling off near the staircase"
      ]
    },
    {
      category: "Electrical & Lighting",
      department: "Electrical & Lighting",
      keywords: ["light", "bulb", "electricity", "power", "outlet", "socket", "switch", "fan", "wiring", "sparks", "short circuit", "fuse", "blackout", "flickering"],
      examples: [
        "The lights in the hallway keep flickering",
        "No power in the second floor lab",
        "Sparks coming from an outlet in the cafeteria",
        "The ceiling fan in Room 305 doesn't work"
      ]
    },
    {
      category: "Plumbing & Water",
      department: "Plumbing & Water",
      keywords: ["water", "leak", "pipe", "toilet", "sink", "drain", "clogged", "tap", "faucet", "shower", "flooding", "sewage", "bathroom", "restroom"],
      examples: [
        "The bathroom on the 3rd floor is flooded",
        "There's a water leak from the ceiling in the library",
        "Toilets in the men's room aren't flushing",
        "The tap in the lab won't stop dripping"
      ]
    },
    {
      category: "HVAC & Climate",
      department: "HVAC & Climate Control",
      keywords: ["AC", "air conditioning", "heating", "heater", "ventilation", "temperature", "hot", "cold", "freezing", "humid", "thermostat", "vent"],
      examples: [
        "The AC in the lecture hall isn't working",
        "It's freezing cold in Room 104",
        "The heater makes a loud noise",
        "Bad smell coming from the vents"
      ]
    },
    {
      category: "Cleaning & Sanitation",
      department: "Housekeeping & Sanitation",
      keywords: ["dirty", "clean", "trash", "garbage", "smell", "odor", "pest", "cockroach", "rat", "mice", "mold", "dusty", "stain", "spill", "waste", "bin"],
      examples: [
        "The classroom hasn't been cleaned in days",
        "There's mold growing in the bathroom",
        "Trash bins are overflowing near the canteen",
        "Saw cockroaches in the hostel kitchen"
      ]
    },
    {
      category: "IT & Network",
      department: "IT & Network Services",
      keywords: ["wifi", "internet", "projector", "computer", "printer", "network", "LAN", "software", "screen", "display", "smartboard", "server"],
      examples: [
        "WiFi is extremely slow in the dorm",
        "The projector in Auditorium B is not working",
        "Can't connect to the campus network",
        "The printer in the library is jammed"
      ]
    },
    {
      category: "Safety & Security",
      department: "Safety & Security",
      keywords: ["lock", "key", "CCTV", "camera", "fire extinguisher", "alarm", "emergency", "theft", "vandalism", "broken glass", "safety", "dark area", "unsafe"],
      examples: [
        "The lock on Room 102 is broken",
        "Fire extinguisher is expired in the hostel",
        "Street lights near parking lot are out",
        "CCTV camera at the entrance is not working"
      ]
    },
    {
      category: "Grounds & Outdoor",
      department: "Grounds & Landscaping",
      keywords: ["parking", "sidewalk", "road", "pothole", "garden", "tree", "grass", "bench", "outdoor", "path", "sign", "gate", "fence"],
      examples: [
        "Big pothole near the science building entrance",
        "Fallen tree blocking the walkway",
        "The bench outside the library is broken",
        "Parking lot needs repainting of lines"
      ]
    },
    {
      category: "Furniture & Equipment",
      department: "Furniture & Equipment",
      keywords: ["desk", "chair", "table", "whiteboard", "marker", "lab equipment", "furniture", "shelf", "cabinet", "locker", "podium"],
      examples: [
        "Several chairs in the lecture hall are broken",
        "The whiteboard markers are all dried out",
        "Lab equipment in Chemistry 201 isn't calibrated",
        "Desk drawers are stuck in the study room"
      ]
    }
  ]
};

// Build a flat text version for the AI prompt
export function getRoutingGuideText() {
  let text = "CAMPUS COMPLAINT ROUTING GUIDE\n";
  text += "=".repeat(50) + "\n\n";

  for (const cat of ROUTING_GUIDE.categories) {
    text += `CATEGORY: ${cat.category}\n`;
    text += `DEPARTMENT: ${cat.department}\n`;
    text += `KEYWORDS: ${cat.keywords.join(", ")}\n`;
    text += `EXAMPLES:\n`;
    for (const ex of cat.examples) {
      text += `  - "${ex}"\n`;
    }
    text += "\n";
  }

  return text;
}

export const VALID_CATEGORIES = ROUTING_GUIDE.categories.map(c => c.category);
export const VALID_DEPARTMENTS = ROUTING_GUIDE.categories.map(c => c.department);
