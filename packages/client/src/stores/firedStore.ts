import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface FiredMessage {
  id: string;
  role: 'user' | 'hr' | 'lawyer' | 'system';
  content: string;
  timestamp: number;
  scores?: FiredScores;
  keyMoment?: string;
  /** On system error messages: which action to retry (e.g., 'send:msg-id', 'init'). */
  retryAction?: 'init' | { type: 'send'; text: string };
}

export interface FiredScores {
  legalKnowledge: number;
  negotiationSkill: number;
  emotionalControl: number;
  evidenceAwareness: number;
}

export interface FiredSuggestion {
  text: string;
  style: string;
}

export interface FiredOutcome {
  compensationMonths: number;
  maxPossible: number;
  summary: string;
}

export type PersonalityId = 'rookie' | 'veteran' | 'demon';

interface FiredStore {
  // Setup
  scenarioId: string | null;
  personalityId: PersonalityId;

  // Conversation
  messages: FiredMessage[];

  // State
  isLoading: boolean;
  isOver: boolean;
  currentScores: FiredScores;
  suggestions: FiredSuggestion[];

  // Result
  outcome: FiredOutcome | null;

  // Actions
  setScenario: (id: string) => void;
  setPersonality: (id: PersonalityId) => void;
  addMessage: (msg: FiredMessage) => void;
  setLoading: (loading: boolean) => void;
  setSuggestions: (suggestions: FiredSuggestion[]) => void;
  updateScores: (scores: FiredScores) => void;
  setOutcome: (outcome: FiredOutcome) => void;
  setIsOver: (over: boolean) => void;
  reset: () => void;
}

const initialScores: FiredScores = {
  legalKnowledge: 0,
  negotiationSkill: 0,
  emotionalControl: 0,
  evidenceAwareness: 0,
};

const STORAGE_KEY = 'fired-session';

export const useFiredStore = create<FiredStore>()(
  persist(
    (set) => ({
      scenarioId: null,
      personalityId: 'veteran',
      messages: [],
      isLoading: false,
      isOver: false,
      currentScores: { ...initialScores },
      suggestions: [],
      outcome: null,

      setScenario: (id) => set({ scenarioId: id }),

      setPersonality: (id) => set({ personalityId: id }),

      addMessage: (msg) => set((s) => ({
        messages: [...s.messages, msg],
      })),

      setLoading: (loading) => set({ isLoading: loading }),

      setSuggestions: (suggestions) => set({ suggestions }),

      updateScores: (scores) => set({ currentScores: scores }),

      setOutcome: (outcome) => set({ outcome }),

      setIsOver: (over) => set({ isOver: over }),

      reset: () => {
        sessionStorage.removeItem(STORAGE_KEY);
        set({
          scenarioId: null,
          personalityId: 'veteran',
          messages: [],
          isLoading: false,
          isOver: false,
          currentScores: { ...initialScores },
          suggestions: [],
          outcome: null,
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
      // Persist conversation & result state; skip transient UI flags
      partialize: (state) => ({
        scenarioId: state.scenarioId,
        personalityId: state.personalityId,
        messages: state.messages,
        isOver: state.isOver,
        currentScores: state.currentScores,
        outcome: state.outcome,
      }),
    },
  ),
);
