/* ══════════════════════════════════════════════════════════════
   models/Journal.js
   Mongoose schema for monthly TA journal rows.
   Each document stores all daily rows for one (employee × month).
   ══════════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

// ── Sub-schema: one journey row ───────────────────────────────
const journeyRowSchema = new mongoose.Schema(
  {
    date:      { type: String, default: '' },   // "YYYY-MM-DD"
    train:     { type: String, default: '' },
    depart:    { type: String, default: '' },   // "HH:MM" 24h
    arrival:   { type: String, default: '' },   // "HH:MM" 24h
    from:      { type: String, default: '' },
    to:        { type: String, default: '' },
    dist:      { type: String, default: '' },
    dayNight:  { type: String, default: '100%' },
    amount:    { type: String, default: '' },
    objective: { type: String, default: 'A.C. Manning' },
  },
  { _id: false }   // no separate _id per row; date is the key
);

// ── Main journal schema ───────────────────────────────────────
const journalSchema = new mongoose.Schema(
  {
    // Who – linked by PF number (matches Employee.pf)
    pf: {
      type:     String,
      required: true,
      trim:     true,
      index:    true,
    },

    // Which month – stored as "YYYY-MM" (e.g. "2026-08")
    month: {
      type:     String,
      required: true,
      trim:     true,
    },

    // All daily rows for this month
    rows: [journeyRowSchema],

    // The month label for quick display (e.g. "August 2026")
    monthLabel: {
      type:    String,
      default: '',
    },

    // Computed totals – stored for quick retrieval
    totalAmount: {
      type:    Number,
      default: 0,
    },
    workingDays: {
      type:    Number,
      default: 0,
    },
  },
  {
    timestamps: true,   // createdAt, updatedAt
    collection: 'journals',
  }
);

// ── Compound unique index: one record per (employee × month) ──
journalSchema.index({ pf: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Journal', journalSchema);
