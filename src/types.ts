/**
 * Types definition for UTBK SNBT Try Out app
 */

export type QuestionType = 'PILIHAN_GANDA' | 'ISIAN_SINGKAT' | 'PILIHAN_GANDA_KOMPLEKS';

export interface Question {
  id: string;
  number: number;
  type: QuestionType;
  question: string;
  options?: string[]; // Used for PILIHAN_GANDA or parts of PILIHAN_GANDA_KOMPLEKS
  correctAnswer: string; // The correct key or exact text or JSON representation
  imageUrl?: string;
}

export interface TryoutSettings {
  title: string;
  duration: number; // in minutes
  spreadsheetId: string;
  active: boolean; // whether quiz is live
  googleFolderId?: string;
  googleAccessToken?: string;
  googleClientId?: string;
}

export interface ExamResult {
  id: string;
  timestamp: string;
  name: string;
  startTime: string;
  endTime: string;
  score: number; // calculated score (0 - 100)
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  answers: Record<string, string>; // questionId -> participant's answer
  gradedDetails: Record<string, boolean>; // questionId -> isCorrect
}
