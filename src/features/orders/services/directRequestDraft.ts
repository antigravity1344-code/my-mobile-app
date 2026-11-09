export type DirectRequestDraft = { workerId: string; workerName: string };

let draft: DirectRequestDraft | null = null;

export function setDirectRequestDraft(value: DirectRequestDraft | null): void {
  draft = value;
}

export function getDirectRequestDraft(): DirectRequestDraft | null {
  return draft;
}
