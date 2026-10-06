/* ══════════════════════════════════════════════════════════════
   models/Employee.js
   Mongoose schema for employee login / profile data.
   Each employee is uniquely identified by their PF number.

   Copyright (c) 2026 Harsh Anand Badal. All rights reserved.
   Licensed under the MIT License.
   ══════════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    // ── Unique identifier ─────────────────────────────────────
    pf: {
      type:     String,
      required: true,
      unique:   true,
      trim:     true,
      index:    true,
    },

    // ── Personal Details ──────────────────────────────────────
    name: {
      type:  String,
      required: true,
      trim:  true,
    },
    designation: {
      type:  String,
      trim:  true,
      default: '',
    },
    customDesig: {
      type:  String,
      trim:  true,
      default: '',
    },
    branch: {
      type:  String,
      trim:  true,
      default: '',
    },
    zone: {
      type:  String,
      trim:  true,
      default: '',
    },
    division: {
      type:  String,
      trim:  true,
      default: '',
    },
    hq: {
      type:  String,
      trim:  true,
      uppercase: true,
      default: '',
    },
    doa: {
      type:  String,   // stored as "YYYY-MM-DD"
      trim:  true,
      default: '',
    },
    doaFormatted: {
      type:  String,   // stored as "03 August 2000"
      trim:  true,
      default: '',
    },

    // ── Pay & Allowance ───────────────────────────────────────
    basicPay: {
      type:  String,
      trim:  true,
      default: '',
    },
    level: {
      type:  String,
      trim:  true,
      default: '',
    },
    gp: {
      type:  String,
      trim:  true,
      default: '',
    },
    scale: {
      type:  String,
      trim:  true,
      default: '',
    },
    taRate: {
      type:  String,
      trim:  true,
      default: '',
    },

    // ── Metadata ──────────────────────────────────────────────
    lastLogin: {
      type:    Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,   // adds createdAt, updatedAt
    collection: 'employees',
  }
);

module.exports = mongoose.model('Employee', employeeSchema);
