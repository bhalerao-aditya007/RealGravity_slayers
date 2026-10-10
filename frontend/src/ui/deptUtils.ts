import { Dept } from '@/config/office';
import { deptColorRT, hasDept } from '@/state/departments';
export const DEPT_CSS_VARS: Record<string, string> = {
  research: 'var(--dept-research)', engineering: 'var(--dept-engineering)',
  data: 'var(--dept-data)', content: 'var(--dept-content)',
};
// run-dynamic department colors first (Triage v3), static CSS vars as legacy fallback
export const deptStyle = (d: Dept | string) =>
  hasDept(d) ? `#${deptColorRT(d).getHexString()}` : DEPT_CSS_VARS[d] ?? '#999';
export { STATUS_COLORS, DEPT_NAME } from '@/config/office';
