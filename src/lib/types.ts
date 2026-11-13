import type { Job } from "@/db/schema";

/** Job seperti yang diterima klien (tanggal berupa string ISO). */
export type ClientJob = Omit<Job, "createdAt" | "finishedAt"> & {
  createdAt: string;
  finishedAt: string | null;
};
