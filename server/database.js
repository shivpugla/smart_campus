import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'campus_connect.db');

// ── Compatibility wrapper around sql.js to mimic better-sqlite3 API ─────
class Database {
  constructor(sqlDb) {
    this._db = sqlDb;
  }

  // Run raw SQL (DDL, multi-statement)
  exec(sql) {
    this._db.run(sql);
  }

  // Create a prepared statement wrapper
  prepare(sql) {
    return new PreparedStatement(this._db, sql);
  }

  // Save database to disk
  save() {
    const data = this._db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

class PreparedStatement {
  constructor(sqlDb, sql) {
    this._db = sqlDb;
    this._sql = sql;
  }

  // Run INSERT/UPDATE/DELETE — returns { changes }
  run(...params) {
    // Handle both positional args and named params (@key)
    const flatParams = params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])
      ? params[0]
      : params;

    this._db.run(this._sql, flatParams);
    // Auto-save after writes
    db.save();
    return { changes: this._db.getRowsModified() };
  }

  // Get a single row as an object
  get(...params) {
    const flatParams = params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])
      ? params[0]
      : params;

    let stmt;
    try {
      stmt = this._db.prepare(this._sql);
      if (Array.isArray(flatParams) && flatParams.length > 0) {
        stmt.bind(flatParams);
      } else if (typeof flatParams === 'object' && !Array.isArray(flatParams)) {
        stmt.bind(flatParams);
      }
      if (stmt.step()) {
        return stmt.getAsObject();
      }
      return undefined;
    } finally {
      if (stmt) stmt.free();
    }
  }

  // Get all matching rows as an array of objects
  all(...params) {
    const flatParams = params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])
      ? params[0]
      : params;

    const results = [];
    let stmt;
    try {
      stmt = this._db.prepare(this._sql);
      if (Array.isArray(flatParams) && flatParams.length > 0) {
        stmt.bind(flatParams);
      } else if (typeof flatParams === 'object' && !Array.isArray(flatParams)) {
        stmt.bind(flatParams);
      }
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
    } finally {
      if (stmt) stmt.free();
    }
    return results;
  }
}

// ── Initialize database ─────────────────────────────────────────────────
let db;

export async function initDatabase() {
  const SQL = await initSqlJs();

  let sqlDb;
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    sqlDb = new SQL.Database(fileBuffer);
  } else {
    sqlDb = new SQL.Database();
  }

  db = new Database(sqlDb);

  // Enable WAL mode and foreign keys
  db.exec("PRAGMA foreign_keys = ON;");

  // ── Create tables ───────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      ticket_number TEXT UNIQUE NOT NULL,
      student_name TEXT NOT NULL,
      student_email TEXT NOT NULL,
      student_phone TEXT DEFAULT '',
      complaint_text TEXT NOT NULL,
      location TEXT NOT NULL,
      building TEXT DEFAULT '',
      floor TEXT DEFAULT '',
      room TEXT DEFAULT '',
      photo_path TEXT DEFAULT '',
      ai_summary TEXT DEFAULT '',
      ai_category TEXT DEFAULT '',
      ai_department TEXT DEFAULT '',
      ai_priority TEXT DEFAULT 'medium',
      ai_missing_info TEXT DEFAULT '',
      ai_analysis TEXT DEFAULT '',
      status TEXT DEFAULT 'open' CHECK(status IN ('open','assigned','in_progress','resolved','closed','duplicate')),
      assigned_to TEXT DEFAULT '',
      staff_notes TEXT DEFAULT '',
      duplicate_of TEXT DEFAULT '',
      duplicate_score REAL DEFAULT 0,
      upvotes INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  // Ensure upvotes column exists if table was already created
  try {
    db.exec("ALTER TABLE tickets ADD COLUMN upvotes INTEGER DEFAULT 0;");
  } catch (e) {
    // Column already exists
  }

  // Populate realistic demo upvotes if existing database has 0 upvotes
  try {
    const votesCheck = db.prepare('SELECT COUNT(*) as count FROM tickets WHERE upvotes > 0').get();
    if (votesCheck && votesCheck.count === 0) {
      db.prepare("UPDATE tickets SET upvotes = 38 WHERE ticket_number = 'CC-261023-E505'").run();
      db.prepare("UPDATE tickets SET upvotes = 19 WHERE ticket_number = 'CC-261023-D404'").run();
      db.prepare("UPDATE tickets SET upvotes = 14 WHERE ticket_number = 'CC-261023-A401'").run();
      db.prepare("UPDATE tickets SET upvotes = 11 WHERE ticket_number = 'CC-261023-B202'").run();
      db.prepare("UPDATE tickets SET upvotes = 7 WHERE ticket_number = 'CC-261023-G707'").run();
      db.prepare("UPDATE tickets SET upvotes = 5 WHERE ticket_number = 'CC-261023-H808'").run();
      db.prepare("UPDATE tickets SET upvotes = 4 WHERE ticket_number = 'CC-261023-F606'").run();
      db.prepare("UPDATE tickets SET upvotes = 3 WHERE ticket_number = 'CC-261023-C303'").run();
    }
  } catch (e) {
    // ignore
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT DEFAULT '',
      performed_by TEXT DEFAULT 'System',
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT DEFAULT '',
      department TEXT DEFAULT '',
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      department TEXT NOT NULL,
      role TEXT DEFAULT 'staff' CHECK(role IN ('staff','admin','supervisor')),
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      contact_email TEXT DEFAULT '',
      head_name TEXT DEFAULT ''
    );
  `);

  db.exec("CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(ai_category);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_tickets_department ON tickets(ai_department);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket ON ticket_history(ticket_id);");

  // ── Seed departments ──────────────────────────────────────────────────
  const departments = [
    { id: 'dept-maintenance', name: 'General Maintenance', description: 'Building repairs, structural issues, general upkeep', contact_email: 'maintenance@campus.edu', head_name: 'John Rodriguez' },
    { id: 'dept-electrical', name: 'Electrical & Lighting', description: 'Power outages, faulty wiring, lighting issues', contact_email: 'electrical@campus.edu', head_name: 'Sarah Chen' },
    { id: 'dept-plumbing', name: 'Plumbing & Water', description: 'Leaks, clogged drains, water supply issues', contact_email: 'plumbing@campus.edu', head_name: 'Mike Torres' },
    { id: 'dept-hvac', name: 'HVAC & Climate Control', description: 'Heating, ventilation, air conditioning', contact_email: 'hvac@campus.edu', head_name: 'Priya Patel' },
    { id: 'dept-cleaning', name: 'Housekeeping & Sanitation', description: 'Cleaning, waste disposal, pest control', contact_email: 'cleaning@campus.edu', head_name: 'David Kim' },
    { id: 'dept-it', name: 'IT & Network Services', description: 'WiFi, projectors, computer labs, network issues', contact_email: 'it@campus.edu', head_name: 'Emily Watson' },
    { id: 'dept-security', name: 'Safety & Security', description: 'Broken locks, surveillance, fire safety equipment', contact_email: 'security@campus.edu', head_name: 'James Okonkwo' },
    { id: 'dept-grounds', name: 'Grounds & Landscaping', description: 'Outdoor areas, parking lots, sidewalks, gardens', contact_email: 'grounds@campus.edu', head_name: 'Maria Gonzalez' },
    { id: 'dept-furniture', name: 'Furniture & Equipment', description: 'Desks, chairs, lab equipment, classroom furniture', contact_email: 'furniture@campus.edu', head_name: 'Robert Singh' },
  ];

  for (const dept of departments) {
    db.prepare(`INSERT OR IGNORE INTO departments (id, name, description, contact_email, head_name) VALUES (?, ?, ?, ?, ?)`)
      .run(dept.id, dept.name, dept.description, dept.contact_email, dept.head_name);
  }

  // ── Seed default staff accounts ───────────────────────────────────────
  const defaultStaff = [
    { id: 'staff-admin', name: 'Admin User', email: 'admin@campus.edu', department: 'Administration', role: 'admin', password: 'admin123' },
    { id: 'staff-maint', name: 'John Rodriguez', email: 'john.r@campus.edu', department: 'General Maintenance', role: 'supervisor', password: 'staff123' },
    { id: 'staff-elec', name: 'Sarah Chen', email: 'sarah.c@campus.edu', department: 'Electrical & Lighting', role: 'staff', password: 'staff123' },
    { id: 'staff-plumb', name: 'Mike Torres', email: 'mike.t@campus.edu', department: 'Plumbing & Water', role: 'staff', password: 'staff123' },
  ];

  for (const s of defaultStaff) {
    db.prepare(`INSERT OR REPLACE INTO staff (id, name, email, department, role, password) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(s.id, s.name, s.email, s.department, s.role, s.password);
  }

  // ── Seed default student accounts ─────────────────────────────────────
  const defaultStudents = [
    { id: 'student-demo', name: 'Priya Sharma', email: 'student@campus.edu', phone: '9876543210', department: 'Computer Science', password: 'student123' },
    { id: 'student-zenith1', name: 'Shiv', email: 'shiv@zenith.ai', phone: '9812345678', department: 'Zenith School of AI', password: 'pass123' },
    { id: 'student-zenith2', name: 'Devang', email: 'devang@zenith.ai', phone: '9812345679', department: 'Zenith School of AI', password: 'pass123' }
  ];

  for (const st of defaultStudents) {
    db.prepare(`INSERT OR REPLACE INTO students (id, name, email, phone, department, password) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(st.id, st.name, st.email, st.phone, st.department, st.password);
  }

  // ── Seed demo tickets if empty ─────────────────────────────────────────
  const ticketCount = db.prepare('SELECT COUNT(*) as count FROM tickets').get().count;
  if (ticketCount === 0) {
    const demoTickets = [
      {
        id: 'demo-t1',
        ticket_number: 'CC-261023-A401',
        student_name: 'Ananya Sen',
        student_email: 'ananya.s@campus.edu',
        student_phone: '9876543210',
        complaint_text: 'Water is steadily dripping from the ceiling right above the economics book stack. Puddles are forming on the carpet and books might get ruined.',
        location: 'Main Library, 2nd Floor, Economics Section',
        building: 'Main Library',
        floor: '2nd Floor',
        room: 'Stack 4B',
        ai_summary: 'Active ceiling water leak endangering book collections in Main Library 2nd floor.',
        ai_category: 'Plumbing & Water',
        ai_department: 'Plumbing & Water',
        ai_priority: 'high',
        ai_missing_info: 'Exact source of water (roof or 3rd floor restroom above).',
        status: 'open',
        assigned_to: '',
        staff_notes: '',
        duplicate_of: '',
        duplicate_score: 0,
        upvotes: 14,
        suggested_action: 'Dispatch plumber to locate overhead leak and place tarps over library bookshelves.'
      },
      {
        id: 'demo-t2',
        ticket_number: 'CC-261023-B202',
        student_name: 'Alex Johnson',
        student_email: 'alex.j@campus.edu',
        student_phone: '9823456789',
        complaint_text: 'The large ceiling fan in the front row is shaking violently and making a loud screeching sound. Earlier today we saw visible sparks from the motor housing. It feels very unsafe.',
        location: 'Science Complex, Block B, Room 302',
        building: 'Science Complex',
        floor: '3rd Floor',
        room: 'Room 302',
        ai_summary: 'Severe mechanical vibration and electrical sparks from ceiling fan posing acute safety hazard.',
        ai_category: 'Electrical & Lighting',
        ai_department: 'Electrical & Lighting',
        ai_priority: 'critical',
        ai_missing_info: '',
        status: 'in_progress',
        assigned_to: 'Sarah Chen',
        staff_notes: 'Room 302 circuit breaker isolated. Replacement motor ordered.',
        duplicate_of: '',
        duplicate_score: 0,
        upvotes: 11,
        suggested_action: 'Immediate electrical shutdown and lock-out tag-out of Room 302 fan circuit.'
      },
      {
        id: 'demo-t3',
        ticket_number: 'CC-261023-C303',
        student_name: 'Rohan Mehta',
        student_email: 'rohan.m@campus.edu',
        student_phone: '',
        complaint_text: 'There is a bad water leak on the second floor of the central library near the study desks. Water is dropping from ceiling tiles.',
        location: 'Central Library, 2nd Floor',
        building: 'Main Library',
        floor: '2nd Floor',
        room: 'Study Area',
        ai_summary: 'Ceiling water leakage dripping near study tables in Library 2nd floor.',
        ai_category: 'Plumbing & Water',
        ai_department: 'Plumbing & Water',
        ai_priority: 'high',
        ai_missing_info: 'Specific study carrel or desk row number.',
        status: 'open',
        assigned_to: '',
        staff_notes: '',
        duplicate_of: JSON.stringify([{ ticket_number: 'CC-261023-A401', similarity_score: 0.88, reason: 'Matching location (Main Library 2nd Floor) and same ceiling water leak issue.' }]),
        duplicate_score: 0.88,
        upvotes: 3,
        suggested_action: 'Merge with open ticket CC-261023-A401 for single inspection response.'
      },
      {
        id: 'demo-t4',
        ticket_number: 'CC-261023-D404',
        student_name: 'David Chen',
        student_email: 'david.c@campus.edu',
        student_phone: '9123456780',
        complaint_text: 'The AC unit in Computer Lab B has stopped cooling and is blowing hot, stale air. The room temperature is over 32C and machines are overheating.',
        location: 'Technology Center, 1st Floor, Lab B',
        building: 'Technology Center',
        floor: '1st Floor',
        room: 'Computer Lab B',
        ai_summary: 'HVAC cooling failure in Computer Lab B causing server and workstation heat warning.',
        ai_category: 'HVAC & Climate',
        ai_department: 'HVAC & Climate Control',
        ai_priority: 'high',
        ai_missing_info: 'Whether outdoor compressor unit is running or tripped.',
        status: 'assigned',
        assigned_to: 'Priya Patel',
        staff_notes: 'Technician dispatched to inspect rooftop condenser unit.',
        duplicate_of: '',
        duplicate_score: 0,
        upvotes: 19,
        suggested_action: 'Dispatch HVAC specialist to check compressor coolant levels and condenser coils.'
      },
      {
        id: 'demo-t5',
        ticket_number: 'CC-261023-E505',
        student_name: 'Maya Lin',
        student_email: 'maya.l@campus.edu',
        student_phone: '',
        complaint_text: 'The WiFi router on the 3rd floor corridor of Hall C disconnects every few minutes. All students studying for finals are having their exam portals disrupted.',
        location: 'Dormitory Hall C, 3rd Floor East Wing',
        building: 'Hall C',
        floor: '3rd Floor',
        room: 'Corridor 3E',
        ai_summary: 'Persistent wireless access point disconnection affecting dormitory floor.',
        ai_category: 'IT & Network',
        ai_department: 'IT & Network Services',
        ai_priority: 'medium',
        ai_missing_info: 'AP beacon name / MAC address label on ceiling mount.',
        status: 'open',
        assigned_to: '',
        staff_notes: '',
        duplicate_of: '',
        duplicate_score: 0,
        upvotes: 38,
        suggested_action: 'Remotely check switch port PoE power and restart Access Point AP-C-3E.'
      },
      {
        id: 'demo-t6',
        ticket_number: 'CC-261023-F606',
        student_name: 'Security Patrol',
        student_email: 'patrol@campus.edu',
        student_phone: '',
        complaint_text: 'Shattered safety glass pane on the exterior emergency exit door facing the parking lot. Sharp shards on the floor.',
        location: 'Chemistry Annex, Emergency Exit Door 3',
        building: 'Chemistry Annex',
        floor: 'Ground Floor',
        room: 'Exit 3',
        ai_summary: 'Broken safety glass on exterior emergency door creating breach and injury hazard.',
        ai_category: 'Safety & Security',
        ai_department: 'Safety & Security',
        ai_priority: 'critical',
        ai_missing_info: '',
        status: 'resolved',
        assigned_to: 'James Okonkwo',
        staff_notes: 'Temporary plywood barrier installed; new reinforced glass fitted and inspected.',
        duplicate_of: '',
        duplicate_score: 0,
        upvotes: 4,
        suggested_action: 'Secure immediate perimeter, vacuum glass fragments, and replace panel.'
      },
      {
        id: 'demo-t7',
        ticket_number: 'CC-261023-G707',
        student_name: 'Marcus Williams',
        student_email: 'marcus.w@campus.edu',
        student_phone: '',
        complaint_text: 'Deep pothole filled with muddy water near the bike racks at the Lot 4 entrance. A cyclist fell this morning.',
        location: 'Student Parking Lot 4, Near West Gate',
        building: 'Outdoor Grounds',
        floor: 'Ground',
        room: 'West Gate Bike Rack',
        ai_summary: 'Hazardous road pothole at Lot 4 entrance creating cycling risk.',
        ai_category: 'Grounds & Outdoor',
        ai_department: 'Grounds & Landscaping',
        ai_priority: 'medium',
        ai_missing_info: 'Approximate diameter and depth of pothole.',
        status: 'open',
        assigned_to: '',
        staff_notes: '',
        duplicate_of: '',
        duplicate_score: 0,
        upvotes: 7,
        suggested_action: 'Deploy asphalt cold-patch repair crew with warning cones.'
      },
      {
        id: 'demo-t8',
        ticket_number: 'CC-261023-H808',
        student_name: 'Emily Davis',
        student_email: 'emily.d@campus.edu',
        student_phone: '',
        complaint_text: 'Trash cans outside the Student Union food court are overflowing with food containers and attracting bees and flies.',
        location: 'Student Union, Outdoor Patio',
        building: 'Student Union',
        floor: 'Ground Floor',
        room: 'Food Court Terrace',
        ai_summary: 'Overflowing waste receptacles attracting pests at outdoor dining terrace.',
        ai_category: 'Cleaning & Sanitation',
        ai_department: 'Housekeeping & Sanitation',
        ai_priority: 'low',
        ai_missing_info: '',
        status: 'closed',
        assigned_to: 'David Kim',
        staff_notes: 'Waste cleared, bins sanitized, and extra recycling container added.',
        duplicate_of: '',
        duplicate_score: 0,
        upvotes: 5,
        suggested_action: 'Empty bins immediately and schedule 2x daily pickups during lunch peak.'
      }
    ];

    for (const t of demoTickets) {
      db.prepare(`
        INSERT INTO tickets (id, ticket_number, student_name, student_email, student_phone,
          complaint_text, location, building, floor, room, photo_path,
          ai_summary, ai_category, ai_department, ai_priority, ai_missing_info, ai_analysis,
          status, assigned_to, staff_notes, duplicate_of, duplicate_score, upvotes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        t.id, t.ticket_number, t.student_name, t.student_email, t.student_phone || '',
        t.complaint_text, t.location, t.building, t.floor, t.room, '',
        t.ai_summary, t.ai_category, t.ai_department, t.ai_priority, t.ai_missing_info,
        JSON.stringify({ summary: t.ai_summary, category: t.ai_category, department: t.ai_department, priority: t.ai_priority, missing_info: t.ai_missing_info, suggested_action: t.suggested_action }),
        t.status, t.assigned_to || '', t.staff_notes || '', t.duplicate_of || '', t.duplicate_score || 0, t.upvotes || 1
      );

      // Add history
      db.prepare(`
        INSERT INTO ticket_history (ticket_id, action, details, performed_by)
        VALUES (?, 'created', ?, 'Student')
      `).run(t.id, `Ticket created by ${t.student_name}. Classified as ${t.ai_category} -> ${t.ai_department} (${t.ai_priority} priority).`);

      if (t.assigned_to) {
        db.prepare(`
          INSERT INTO ticket_history (ticket_id, action, details, performed_by)
          VALUES (?, 'assigned', ?, 'Supervisor')
        `).run(t.id, `Assigned to ${t.assigned_to}`);
      }

      if (t.status === 'in_progress') {
        db.prepare(`
          INSERT INTO ticket_history (ticket_id, action, details, performed_by)
          VALUES (?, 'status_changed', 'Status changed from "assigned" to "in_progress"', ?)
        `).run(t.id, t.assigned_to || 'Staff');
      } else if (t.status === 'resolved') {
        db.prepare(`
          INSERT INTO ticket_history (ticket_id, action, details, performed_by)
          VALUES (?, 'status_changed', 'Status changed to "resolved". Work verified.', ?)
        `).run(t.id, t.assigned_to || 'Staff');
      } else if (t.status === 'closed') {
        db.prepare(`
          INSERT INTO ticket_history (ticket_id, action, details, performed_by)
          VALUES (?, 'status_changed', 'Ticket closed successfully.', ?)
        `).run(t.id, t.assigned_to || 'Staff');
      }

      if (t.duplicate_score >= 0.6) {
        db.prepare(`
          INSERT INTO ticket_history (ticket_id, action, details, performed_by)
          VALUES (?, 'duplicate_flagged', ?, 'AI System')
        `).run(t.id, `Potential duplicate detected with CC-261023-A401 (${Math.round(t.duplicate_score * 100)}% similarity)`);
      }
    }
    console.log('✅ Demo tickets seeded successfully');
  }

  db.save();
  console.log('✅ Database initialized successfully');
  return db;
}

export default (() => {
  // Return a proxy that will delegate to the initialized db
  return new Proxy({}, {
    get(_, prop) {
      if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
      return db[prop];
    }
  });
})();
