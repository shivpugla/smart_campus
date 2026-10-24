import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import db, { initDatabase } from './database.js';
import { analyzeComplaint, checkDuplicates, isGeminiConfigured } from './ai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── File Upload Config ──────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '..', 'uploads');
import fs from 'fs';
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype);
    cb(null, extOk && mimeOk);
  }
});

// Serve uploaded images
app.use('/uploads', express.static(uploadsDir));

// ── Helper: Generate ticket number ──────────────────────────────────────────
function generateTicketNumber() {
  const date = new Date();
  const y = date.getFullYear().toString().slice(2);
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CC-${y}${m}${d}-${rand}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// STUDENT API ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/tickets — Submit a new complaint
app.post('/api/tickets', upload.single('photo'), async (req, res) => {
  try {
    const { student_name, student_email, student_phone, complaint_text, location, building, floor, room } = req.body;

    if (!student_name || !student_email || !complaint_text || !location) {
      return res.status(400).json({ error: 'Name, email, complaint, and location are required.' });
    }

    const id = uuidv4();
    const ticket_number = generateTicketNumber();
    const photoPath = req.file ? req.file.path : '';
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : '';

    // ── AI Analysis ─────────────────────────────────────────────────────
    const aiResult = await analyzeComplaint(complaint_text, location, photoPath || null);
    const analysis = aiResult.analysis;

    // ── Duplicate Detection ─────────────────────────────────────────────
    const recentTickets = db.prepare(`
      SELECT ticket_number, complaint_text, location, ai_summary, ai_category, status
      FROM tickets
      WHERE status NOT IN ('closed', 'resolved')
      AND created_at > datetime('now', '-30 days')
      ORDER BY created_at DESC
      LIMIT 50
    `).all();

    const dupResult = await checkDuplicates(complaint_text, location, recentTickets);
    const duplicateInfo = dupResult.duplicates && dupResult.duplicates.length > 0
      ? JSON.stringify(dupResult.duplicates)
      : '';
    const topDupScore = dupResult.duplicates && dupResult.duplicates.length > 0
      ? Math.max(...dupResult.duplicates.map(d => d.similarity_score))
      : 0;

    // ── Insert ticket ───────────────────────────────────────────────────
    db.prepare(`
      INSERT INTO tickets (id, ticket_number, student_name, student_email, student_phone,
        complaint_text, location, building, floor, room, photo_path,
        ai_summary, ai_category, ai_department, ai_priority, ai_missing_info, ai_analysis,
        duplicate_of, duplicate_score, upvotes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, ticket_number, student_name, student_email, student_phone || '',
      complaint_text, location, building || '', floor || '', room || '', photoUrl,
      analysis.summary || '', analysis.category || '', analysis.department || '',
      analysis.priority || 'medium', analysis.missing_info || '',
      JSON.stringify(analysis),
      duplicateInfo, topDupScore, 1
    );

    // ── Record history ──────────────────────────────────────────────────
    db.prepare(`
      INSERT INTO ticket_history (ticket_id, action, details, performed_by)
      VALUES (?, 'created', ?, 'Student')
    `).run(id, `Ticket submitted by ${student_name}. AI classified as ${analysis.category} → ${analysis.department} (${analysis.priority} priority)`);

    if (topDupScore >= 0.6) {
      db.prepare(`
        INSERT INTO ticket_history (ticket_id, action, details, performed_by)
        VALUES (?, 'duplicate_flagged', ?, 'AI System')
      `).run(id, `Potential duplicate(s) detected: ${duplicateInfo}`);
    }

    res.status(201).json({
      success: true,
      ticket: {
        id,
        ticket_number,
        ai_summary: analysis.summary,
        ai_category: analysis.category,
        ai_department: analysis.department,
        ai_priority: analysis.priority,
        ai_missing_info: analysis.missing_info,
        suggested_action: analysis.suggested_action,
        key_details: analysis.key_details,
        status: 'open',
        duplicates: dupResult.duplicates || [],
        created_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Error creating ticket:', err);
    res.status(500).json({ error: 'Failed to create ticket. Please try again.' });
  }
});

// GET /api/tickets/track/:ticketNumber — Student tracks their ticket
app.get('/api/tickets/track/:ticketNumber', (req, res) => {
  const ticket = db.prepare(`
    SELECT id, ticket_number, student_name, complaint_text, location, building, floor, room,
      photo_path, ai_summary, ai_category, ai_department, ai_priority, ai_missing_info,
      status, assigned_to, staff_notes, created_at, updated_at
    FROM tickets WHERE ticket_number = ?
  `).get(req.params.ticketNumber);

  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found. Please check the ticket number.' });
  }

  const history = db.prepare(`
    SELECT action, details, performed_by, created_at
    FROM ticket_history WHERE ticket_id = ?
    ORDER BY created_at ASC
  `).all(ticket.id);

  res.json({ ticket, history });
});

// GET /api/public/tickets — Student Public Issues Feed & Community Board
app.get('/api/public/tickets', (req, res) => {
  const { category, search, sort } = req.query;

  let query = `
    SELECT id, ticket_number, student_name, complaint_text, location, building, floor, room,
      photo_path, ai_summary, ai_category, ai_department, ai_priority, status, upvotes, created_at
    FROM tickets
    WHERE status != 'duplicate'
  `;
  const params = [];

  if (category && category !== 'all') {
    query += ' AND ai_category = ?';
    params.push(category);
  }

  if (search) {
    query += ' AND (complaint_text LIKE ? OR ai_summary LIKE ? OR location LIKE ? OR ticket_number LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  if (sort === 'trending' || sort === 'upvotes') {
    query += ' ORDER BY upvotes DESC, created_at DESC';
  } else {
    query += ' ORDER BY created_at DESC';
  }

  const tickets = db.prepare(query).all(...params);

  // Mask student last names for privacy (e.g. "Ananya S." or "Rahul M.")
  const sanitized = tickets.map(t => {
    const parts = (t.student_name || 'Student').trim().split(' ');
    const maskedName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
    return {
      ...t,
      student_name: maskedName,
      upvotes: t.upvotes || 0
    };
  });

  res.json({ tickets: sanitized });
});

// POST /api/tickets/:id/upvote — Student upvotes / "I have this issue too"
app.post('/api/tickets/:id/upvote', (req, res) => {
  const { action } = req.body || {}; // 'upvote' or 'remove'
  const ticket = db.prepare('SELECT id, ticket_number, upvotes, student_name, ai_summary FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  let currentUpvotes = ticket.upvotes || 0;
  if (action === 'remove') {
    currentUpvotes = Math.max(0, currentUpvotes - 1);
  } else {
    currentUpvotes += 1;
  }

  db.prepare('UPDATE tickets SET upvotes = ? WHERE id = ?').run(currentUpvotes, req.params.id);

  // If milestone upvotes reached, log to timeline history
  if ([5, 10, 20, 35, 50].includes(currentUpvotes)) {
    db.prepare(`
      INSERT INTO ticket_history (ticket_id, action, details, performed_by)
      VALUES (?, 'note_added', ?, 'Community Impact System')
    `).run(ticket.id, `⭐ High student impact: ${currentUpvotes} students confirmed facing this issue.`);
  }

  res.json({ success: true, upvotes: currentUpvotes });
});

// ══════════════════════════════════════════════════════════════════════════════
// UNIFIED AUTHENTICATION ROUTES (STUDENTS & STAFF)
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/auth/register — Register a new student or staff account
app.post('/api/auth/register', (req, res) => {
  try {
    const { role = 'student', name, email, password, phone = '', department = '', staffRole = 'staff' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    const cleanPass = password.trim();

    if (cleanPass.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
    }

    if (role === 'staff') {
      const existing = db.prepare('SELECT id FROM staff WHERE LOWER(email) = ?').get(cleanEmail);
      if (existing) {
        return res.status(409).json({ error: 'A staff account with this email already exists. Please sign in.' });
      }

      const id = 'staff-' + uuidv4().slice(0, 8);
      const dept = department || 'General Maintenance';
      const r = ['admin', 'supervisor', 'staff'].includes(staffRole) ? staffRole : 'staff';

      db.prepare(`
        INSERT INTO staff (id, name, email, department, role, password)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, cleanName, cleanEmail, dept, r, cleanPass);

      const staff = db.prepare('SELECT id, name, email, department, role FROM staff WHERE id = ?').get(id);
      return res.status(201).json({ success: true, role: 'staff', user: staff });
    } else {
      // Student registration
      const existing = db.prepare('SELECT id FROM students WHERE LOWER(email) = ?').get(cleanEmail);
      if (existing) {
        return res.status(409).json({ error: 'A student account with this email already exists. Please sign in.' });
      }

      const id = 'student-' + uuidv4().slice(0, 8);
      const dept = department || 'General Studies';

      db.prepare(`
        INSERT INTO students (id, name, email, phone, department, password)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, cleanName, cleanEmail, phone.trim(), dept, cleanPass);

      const student = db.prepare('SELECT id, name, email, phone, department FROM students WHERE id = ?').get(id);
      return res.status(201).json({ success: true, role: 'student', user: { ...student, role: 'student' } });
    }
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error during registration. Please try again.' });
  }
});

// POST /api/auth/login — Login for students or staff
app.post('/api/auth/login', (req, res) => {
  try {
    const { role = 'student', email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (role === 'staff') {
      const staff = db.prepare('SELECT id, name, email, department, role FROM staff WHERE LOWER(email) = ? AND password = ?')
        .get(cleanEmail, cleanPass);

      if (!staff) {
        return res.status(401).json({ error: 'Invalid staff credentials. Demo: admin@campus.edu / admin123' });
      }

      return res.json({ success: true, role: 'staff', user: staff });
    } else {
      const student = db.prepare('SELECT id, name, email, phone, department FROM students WHERE LOWER(email) = ? AND password = ?')
        .get(cleanEmail, cleanPass);

      if (!student) {
        return res.status(401).json({ error: 'Invalid student credentials. Demo: student@campus.edu / student123, or register a new account.' });
      }

      return res.json({ success: true, role: 'student', user: { ...student, role: 'student' } });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login. Please try again.' });
  }
});

// POST /api/staff/login — Simple staff login (backward compatibility)
app.post('/api/staff/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Please enter both email and password.' });
  }
  const cleanEmail = email.trim().toLowerCase();
  const cleanPass = password.trim();
  const staff = db.prepare('SELECT id, name, email, department, role FROM staff WHERE LOWER(email) = ? AND password = ?')
    .get(cleanEmail, cleanPass);

  if (!staff) {
    return res.status(401).json({ error: 'Invalid credentials. Demo: admin@campus.edu / admin123' });
  }

  res.json({ success: true, staff });
});

// GET /api/staff/tickets — Get all tickets (with optional filters)
app.get('/api/staff/tickets', (req, res) => {
  const { status, category, department, priority, search, sort, order } = req.query;

  let query = 'SELECT * FROM tickets WHERE 1=1';
  const params = [];

  if (status && status !== 'all') {
    query += ' AND status = ?';
    params.push(status);
  }
  if (category) {
    query += ' AND ai_category = ?';
    params.push(category);
  }
  if (department) {
    query += ' AND ai_department = ?';
    params.push(department);
  }
  if (priority) {
    query += ' AND ai_priority = ?';
    params.push(priority);
  }
  if (search) {
    query += ' AND (complaint_text LIKE ? OR ai_summary LIKE ? OR ticket_number LIKE ? OR student_name LIKE ? OR location LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
  }

  const sortCol = ['created_at', 'updated_at', 'ai_priority', 'status'].includes(sort) ? sort : 'created_at';
  const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';
  query += ` ORDER BY ${sortCol} ${sortOrder}`;

  const tickets = db.prepare(query).all(...params);
  res.json({ tickets });
});

// GET /api/staff/tickets/:id — Get single ticket details
app.get('/api/staff/tickets/:id', (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const history = db.prepare(`
    SELECT action, details, performed_by, created_at
    FROM ticket_history WHERE ticket_id = ?
    ORDER BY created_at ASC
  `).all(req.params.id);

  res.json({ ticket, history });
});

// PATCH /api/staff/tickets/:id — Update ticket (assign, change status, add notes)
app.patch('/api/staff/tickets/:id', (req, res) => {
  const { status, assigned_to, staff_notes, staff_name } = req.body;
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const updates = [];
  const params = [];
  const historyEntries = [];

  if (status && status !== ticket.status) {
    updates.push('status = ?');
    params.push(status);
    historyEntries.push({ action: 'status_changed', details: `Status changed from "${ticket.status}" to "${status}"` });
  }
  if (assigned_to !== undefined && assigned_to !== ticket.assigned_to) {
    updates.push('assigned_to = ?');
    params.push(assigned_to);
    historyEntries.push({ action: 'assigned', details: `Assigned to ${assigned_to}` });
  }
  if (staff_notes !== undefined) {
    updates.push('staff_notes = ?');
    params.push(staff_notes);
    if (staff_notes && staff_notes !== ticket.staff_notes) {
      historyEntries.push({ action: 'note_added', details: staff_notes });
    }
  }

  if (updates.length === 0) {
    return res.json({ success: true, message: 'No changes made' });
  }

  updates.push("updated_at = datetime('now')");
  params.push(req.params.id);

  db.prepare(`UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const performer = staff_name || 'Staff';
  for (const entry of historyEntries) {
    db.prepare('INSERT INTO ticket_history (ticket_id, action, details, performed_by) VALUES (?, ?, ?, ?)')
      .run(req.params.id, entry.action, entry.details, performer);
  }

  const updated = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  res.json({ success: true, ticket: updated });
});

// GET /api/staff/stats — Dashboard statistics
app.get('/api/staff/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM tickets').get().count;
  const open = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'open'").get().count;
  const assigned = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'assigned'").get().count;
  const inProgress = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'in_progress'").get().count;
  const resolved = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'resolved'").get().count;
  const closed = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'closed'").get().count;
  const duplicate = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'duplicate'").get().count;
  const critical = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE ai_priority = 'critical' AND status NOT IN ('resolved','closed')").get().count;
  const high = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE ai_priority = 'high' AND status NOT IN ('resolved','closed')").get().count;
  const flaggedDuplicates = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE duplicate_score >= 0.6 AND status != 'duplicate'").get().count;

  const byCategory = db.prepare(`
    SELECT ai_category as category, COUNT(*) as count FROM tickets
    WHERE status NOT IN ('closed','resolved') GROUP BY ai_category ORDER BY count DESC
  `).all();

  const byDepartment = db.prepare(`
    SELECT ai_department as department, COUNT(*) as count FROM tickets
    WHERE status NOT IN ('closed','resolved') GROUP BY ai_department ORDER BY count DESC
  `).all();

  const recentTickets = db.prepare(`
    SELECT ticket_number, ai_summary, ai_category, ai_priority, status, created_at
    FROM tickets ORDER BY created_at DESC LIMIT 5
  `).all();

  res.json({
    total, open, assigned, inProgress, resolved, closed, duplicate,
    critical, high, flaggedDuplicates,
    byCategory, byDepartment, recentTickets
  });
});

// GET /api/departments — List departments
app.get('/api/departments', (req, res) => {
  const departments = db.prepare('SELECT * FROM departments').all();
  res.json({ departments });
});

// GET /api/staff/members — List staff members
app.get('/api/staff/members', (req, res) => {
  const members = db.prepare('SELECT id, name, email, department, role FROM staff').all();
  res.json({ members });
});

// GET /api/settings/ai-status — Check Gemini AI status
app.get('/api/settings/ai-status', (req, res) => {
  const configured = isGeminiConfigured();
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const masked = key ? `${key.substring(0, 6)}...${key.substring(key.length - 4)}` : '';
  res.json({
    configured,
    model: 'gemini-3.8-flash',
    maskedKey: masked
  });
});

// POST /api/settings/ai-key — Update Gemini API key
app.post('/api/settings/ai-key', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 15) {
    return res.status(400).json({ error: 'Please provide a valid Gemini API Key.' });
  }
  process.env.GOOGLE_API_KEY = apiKey.trim();
  process.env.GEMINI_API_KEY = apiKey.trim();
  res.json({ success: true, message: 'Gemini API Key updated successfully' });
});

// DELETE /api/staff/tickets/:id — Delete a ticket
app.delete('/api/staff/tickets/:id', (req, res) => {
  const ticket = db.prepare('SELECT id FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  db.prepare('DELETE FROM ticket_history WHERE ticket_id = ?').run(req.params.id);
  db.prepare('DELETE FROM tickets WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Ticket deleted' });
});

// ── Fallback: serve index.html for SPA ──────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Start server ────────────────────────────────────────────────────────────
async function start() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`\n🏫 CampusConnect Server running at http://localhost:${PORT}\n`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
