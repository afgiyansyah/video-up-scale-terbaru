import {
  bigint,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export type EnhanceSettings = {
  /** Tinggi sisi terpendek target (0 = pertahankan resolusi asli) */
  targetShortSide: number;
  /** 0-100 */
  denoise: number;
  /** 0-100 */
  sharpen: number;
  /** -50..50 */
  contrast: number;
  /** -50..50 */
  brightness: number;
  /** -50..50 */
  saturation: number;
  /** "standard" | "high" */
  quality: "standard" | "high";
  /** hanya proses 5 detik pertama */
  preview: boolean;
};

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  originalName: text("original_name").notNull(),
  status: text("status").notNull().default("queued"), // queued | processing | done | failed
  progress: integer("progress").notNull().default(0),
  settings: jsonb("settings").$type<EnhanceSettings>().notNull(),
  inputSize: bigint("input_size", { mode: "number" }).notNull().default(0),
  outputSize: bigint("output_size", { mode: "number" }),
  srcWidth: integer("src_width"),
  srcHeight: integer("src_height"),
  outWidth: integer("out_width"),
  outHeight: integer("out_height"),
  duration: doublePrecision("duration"),
  fps: doublePrecision("fps"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
});

export type Job = typeof jobs.$inferSelect;
