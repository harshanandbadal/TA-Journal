/* ══════════════════════════════════════════════════════════════
   server.js  –  TA Rail Journal  –  Express + MongoDB backend
   ══════════════════════════════════════════════════════════════
   Endpoints:
     POST   /api/employee          – upsert employee profile
     GET    /api/employee/:pf      – fetch employee by PF No.
     GET    /api/employees         – list all employees (admin)

     POST   /api/journal           – upsert journal rows (month)
     GET    /api/journal/:pf/:month – fetch journal for emp+month
     GET    /api/journals/:pf      – list all months for emp
   ══════════════════════════════════════════════════════════════ */

'use strict';

require('dotenv').config();

// ── Force public DNS (fixes ISP networks that block MongoDB SRV lookups) ─────
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {
  console.warn('Could not set custom DNS servers:', e.message);
}

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');

const Employee = require('./models/Employee');
const Journal  = require('./models/Journal');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve the static frontend files (HTML/CSS/JS) from the same folder
app.use(express.static(path.join(__dirname)));

// ══════════════════════════════════════════════════════════════
//  MongoDB Connection (Serverless compatible cached connection)
// ══════════════════════════════════════════════════════════════
let cachedDbPromise = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (cachedDbPromise) {
    return cachedDbPromise;
  }

  const uri = process.env.MONGO_URI;
  if (!uri || uri.includes('YOUR_USERNAME')) {
    throw new Error('MONGO_URI is not configured in environment variables.');
  }

  cachedDbPromise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  try {
    await cachedDbPromise;
    console.log('✅  Connected to MongoDB Atlas – database: ta_rail');
    return mongoose.connection;
  } catch (err) {
    cachedDbPromise = null;
    console.error('❌  MongoDB connection failed:', err.message);
    throw err;
  }
}

// Middleware to ensure DB connection for API routes
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api')) {
    try {
      await connectDB();
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Database connection error: ' + e.message });
    }
  }
  next();
});

// ══════════════════════════════════════════════════════════════
//  HELPER – standard JSON response
// ══════════════════════════════════════════════════════════════
const ok  = (res, data, msg = 'OK', code = 200) =>
  res.status(code).json({ success: true,  message: msg, data });

const err = (res, msg, code = 500) =>
  res.status(code).json({ success: false, message: msg });

// ══════════════════════════════════════════════════════════════
//  EMPLOYEE ROUTES
// ══════════════════════════════════════════════════════════════

/**
 * POST /api/employee
 * Body: employee profile object (must include pf + name)
 * Creates a new record or updates existing one (upsert by PF).
 */
app.post('/api/employee', async (req, res) => {
  try {
    const body = req.body;
    if (!body.pf)   return err(res, 'PF number is required.', 400);
    if (!body.name) return err(res, 'Name is required.', 400);

    const employee = await Employee.findOneAndUpdate(
      { pf: body.pf.trim() },           // filter
      { ...body, lastLogin: new Date() }, // update
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    ok(res, employee, 'Employee profile saved.', 200);
  } catch (e) {
    console.error('POST /api/employee error:', e.message);
    err(res, 'Failed to save employee profile: ' + e.message);
  }
});

/**
 * GET /api/employee/:pf
 * Fetch a single employee by their PF number.
 */
app.get('/api/employee/:pf', async (req, res) => {
  try {
    const pf = req.params.pf.trim();
    const employee = await Employee.findOne({ pf });
    if (!employee) return err(res, 'Employee not found.', 404);
    ok(res, employee, 'Employee found.');
  } catch (e) {
    console.error('GET /api/employee/:pf error:', e.message);
    err(res, 'Failed to fetch employee: ' + e.message);
  }
});

/**
 * GET /api/employees
 * List all employees (admin view – returns summary, not full pay details).
 */
app.get('/api/employees', async (req, res) => {
  try {
    const employees = await Employee
      .find({}, 'pf name designation branch division hq zone lastLogin')
      .sort({ lastLogin: -1 });
    ok(res, employees, `${employees.length} employees found.`);
  } catch (e) {
    console.error('GET /api/employees error:', e.message);
    err(res, 'Failed to list employees: ' + e.message);
  }
});

// ══════════════════════════════════════════════════════════════
//  JOURNAL ROUTES
// ══════════════════════════════════════════════════════════════

/**
 * POST /api/journal
 * Body: { pf, month, rows, monthLabel, totalAmount, workingDays }
 * Upserts the entire journal for one (employee × month).
 */
app.post('/api/journal', async (req, res) => {
  try {
    const { pf, month, rows, monthLabel, totalAmount, workingDays } = req.body;
    if (!pf)    return err(res, 'PF number is required.', 400);
    if (!month) return err(res, 'Month (YYYY-MM) is required.', 400);

    const journal = await Journal.findOneAndUpdate(
      { pf: pf.trim(), month: month.trim() },
      { pf: pf.trim(), month: month.trim(), rows, monthLabel, totalAmount, workingDays },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    ok(res, journal, 'Journal saved.');
  } catch (e) {
    console.error('POST /api/journal error:', e.message);
    err(res, 'Failed to save journal: ' + e.message);
  }
});

/**
 * GET /api/journal/:pf/:month
 * Fetch all rows for one employee + month ("2026-08").
 */
app.get('/api/journal/:pf/:month', async (req, res) => {
  try {
    const { pf, month } = req.params;
    const journal = await Journal.findOne({ pf: pf.trim(), month: month.trim() });
    if (!journal) return err(res, 'Journal not found.', 404);
    ok(res, journal, 'Journal found.');
  } catch (e) {
    console.error('GET /api/journal error:', e.message);
    err(res, 'Failed to fetch journal: ' + e.message);
  }
});

/**
 * GET /api/journals/:pf
 * List all months saved for an employee (summary only).
 */
app.get('/api/journals/:pf', async (req, res) => {
  try {
    const pf = req.params.pf.trim();
    const journals = await Journal
      .find({ pf }, 'pf month monthLabel totalAmount workingDays updatedAt')
      .sort({ month: -1 });
    ok(res, journals, `${journals.length} journal(s) found.`);
  } catch (e) {
    console.error('GET /api/journals/:pf error:', e.message);
    err(res, 'Failed to list journals: ' + e.message);
  }
});

// ── Health check ───────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const state = mongoose.connection.readyState;
  const status = ['disconnected', 'connected', 'connecting', 'disconnecting'][state] || 'unknown';
  res.json({ success: true, server: 'TA Rail Journal API', mongo: status });
});

// ── Catch-all: serve index.html for non-API routes ────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ══════════════════════════════════════════════════════════════
//  START & EXPORT
// ══════════════════════════════════════════════════════════════
if (require.main === module) {
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`🚂  TA Rail server running  →  http://localhost:${PORT}`);
      console.log(`📄  Open  →  http://localhost:${PORT}/login.html`);
    });
  }).catch(err => {
    console.error('Failed to start server locally:', err.message);
  });
}

module.exports = app;
