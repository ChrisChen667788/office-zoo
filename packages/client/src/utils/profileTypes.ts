/**
 * profileTypes — client-side mirror of the server's UserProfile +
 * PersonalizedProfile shapes from packages/server/src/services. We
 * duplicate the types here (rather than reaching across the package
 * boundary) because the client doesn't import server code, and these
 * are tiny structural types that won't drift.
 *
 * v1.3.0.
 */

import type { TraitVector } from '@furball/shared';

export interface PersonalizedProfile {
  catchphrases: [string, string, string];
  tagline: string;
}

export interface UserProfile {
  userId: string;
  topArchetypes: [string, string, string];
  traits: TraitVector;
  personalized: PersonalizedProfile;
  takenAt: number;
}
