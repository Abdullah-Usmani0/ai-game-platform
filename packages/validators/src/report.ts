export interface Issue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  at?: { x?: number; y?: number; path?: string };
}

export interface ValidationReport {
  ok: boolean;
  issues: Issue[];
  metrics: Record<string, number | string | boolean>;
}

export function report(issues: Issue[], metrics: Record<string, number | string | boolean> = {}): ValidationReport {
  return { ok: issues.every((i) => i.severity !== 'error'), issues, metrics };
}

export function err(code: string, message: string, at?: Issue['at']): Issue {
  return { code, message, severity: 'error', at };
}

export function warn(code: string, message: string, at?: Issue['at']): Issue {
  return { code, message, severity: 'warning', at };
}
