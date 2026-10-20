import { TabariumDB } from './db';
import { Repository } from './repo';

/** The single database instance and repository used by extension pages. */
export const db = new TabariumDB();
export const repo = new Repository(db);
