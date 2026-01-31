import type { NoteSequence } from "./noteSequence";

export interface TuneNugget {
  id: string;
  noteSequence: NoteSequence;
  leftHandSequence?: NoteSequence | null;
  rightHandSequence?: NoteSequence | null;
  location?: {
    startMeasure: number;
    endMeasure: number;
    startBeat: number;
    endBeat: number;
  };
  dependsOn?: string[];
}

export interface TuneAssembly {
  id: string;
  noteSequence: NoteSequence;
  leftHandSequence?: NoteSequence | null;
  rightHandSequence?: NoteSequence | null;
  nuggetIds: string[];
  tier?: number;
}

export interface TuneBriefing {
  title?: string;
  teachingOrder?: string[];
  assemblyOrder?: string[];
  hints?: Record<string, string>;
}

export interface TuneAssetData {
  id: string;
  tune_key: string;
  version_id: string;
  note_sequence: NoteSequence;
  left_hand_sequence?: NoteSequence | null;
  right_hand_sequence?: NoteSequence | null;
  tune_xml: string | null;
  tune_dsp_xml: string | null;
  nuggets: TuneNugget[] | null;
  nugget_xmls: Record<string, string> | null;
  nugget_dsp_xmls: Record<string, string> | null;
  assemblies: TuneAssembly[] | null;
  assembly_xmls: Record<string, string> | null;
  assembly_dsp_xmls: Record<string, string> | null;
  briefing: TuneBriefing | null;
  created_at?: string | null;
}
