// Domain model. Every persisted entity carries uuid + updatedAt + updatedBy
// (sync-ready from day one).

export type EntityBase = {
  id: string;
  updatedAt: number;
  updatedBy: string;
};

export type GradingMode = "grades" | "points"; // 1–6 or 0–15 Punkte (Oberstufe)

export type Course = EntityBase & {
  name: string;
  gradingMode: GradingMode;
  scaleId: string | null; // default scale for assessments in this course
};

export type Student = EntityBase & {
  courseId: string;
  lastName: string;
  firstName: string;
  note: string;
  photo: string | null; // compressed webp data URL (~200px)
};

// The grade tree: internal nodes are weighted categories, leaves are assessments.
export type TreeNode = EntityBase & {
  courseId: string;
  parentId: string | null;
  name: string;
  weight: number; // relative weight within its parent
  kind: "category" | "assessment";
  date: string | null; // ISO date for assessments
  maxPoints: number | null; // assessments only; null = direct grade entry
  scaleId: string | null; // per-assessment scale override
};

export type EntryStatus = "graded" | "excused" | "unexcused";

export type GradeEntry = EntityBase & {
  courseId: string;
  studentId: string;
  nodeId: string; // must be an assessment leaf
  status: EntryStatus;
  // grades mode: value = decimal grade (2.25 for "2-").
  // points mode: points = 0–15.
  value: number | null;
  points: number | null;
  comment: string;
};

// Percent->grade scale for assessments (e.g. >=87.5% = 1). Thresholds are
// "at least this percent gets this grade", sorted descending by percent.
export type Scale = EntityBase & {
  name: string;
  mode: GradingMode;
  thresholds: { pct: number; grade: number }[]; // grade: decimal or points
};

export type VaultMeta = {
  deviceId: string;
  pinSalt: string; // base64
  pinVerifier: string; // base64 ciphertext of a known plaintext
  pinIterations: number;
  lastBackupAt: number | null;
  backupReminderDays: number;
  theme?: "light" | "dark";
  lastSyncAt?: number | null; // V5: Basis für LWW-Konflikterkennung
};

// V4: Unterrichts-Alltag
export type Checklist = EntityBase & {
  courseId: string;
  name: string;
  ticked: string[]; // studentIds
};

export type Incident = EntityBase & {
  courseId: string;
  studentId: string;
  date: string; // ISO day
  kind: "homework" | "material";
  note: string;
};

export type SeatPlan = EntityBase & {
  courseId: string;
  positions: Record<string, { x: number; y: number }>; // studentId -> % coords
};

export type StudentNote = EntityBase & {
  courseId: string;
  studentId: string;
  date: string; // ISO day
  category: string; // z. B. Verhalten, Elternkontakt
  text: string;
};

export type TableName = "courses" | "students" | "nodes" | "entries" | "scales"
  | "checklists" | "incidents" | "seatplans" | "notes";
