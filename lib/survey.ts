import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export interface SurveyQuestion {
  id: string;
  prompt: string;
  minLength?: number;
}

export interface Survey {
  id: string;
  title: string;
  intro?: string;
  outro?: string;
  questions: SurveyQuestion[];
}

const cache = new Map<string, Survey>();

export function loadSurvey(id: string): Survey {
  const c = cache.get(id);
  if (c) return c;
  const file = path.join(process.cwd(), 'surveys', `${id}.yaml`);
  const raw = fs.readFileSync(file, 'utf8');
  const s = YAML.parse(raw) as Survey;
  cache.set(id, s);
  return s;
}
