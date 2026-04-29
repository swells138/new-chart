export type RelationshipType =
  | "Talking"
  | "Dating"
  | "Situationship"
  | "Exes"
  | "Married"
  | "Sneaky Link"
  | "Friends"
  | "Lovers"
  | "One Night Stand"
  | "complicated"
  | "FWB";

export interface User {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  handle: string;
  pronouns: string;
  bio: string;
  interests: string[];
  relationshipStatus: string;
  location: string;
  links: {
    website?: string;
    social?: string;
  };
  featured: boolean;
  profileImage?: string | null;
}

export interface Post {
  id: string;
  userId: string;
  content: string;
  timestamp: string;
  tags: string[];
  likes: number;
  comments: number;
}

export interface Relationship {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  note: string;
  isPublic: boolean;
  publicRequestedBy: string | null;
}

// claimStatus: "unclaimed" | "invited" | "claimed" | "denied"
export interface PlaceholderPerson {
  id: string;
  ownerId: string;
  name: string;
  offerToNameMatch: boolean;
  email: string;
  phoneNumber: string;
  relationshipType: RelationshipType;
  note: string;
  inviteToken: string | null;
  linkedUserId: string | null;
  claimStatus: "unclaimed" | "invited" | "claimed" | "denied";
  createdAt: string;
}

export interface PrivateConnectionEdge {
  id: string;
  ownerId: string;
  sourcePlaceholderId: string;
  targetPlaceholderId: string;
  relationshipType: RelationshipType;
  note: string;
  createdAt: string;
}

export interface PrivateConfirmedConnectionEdge {
  id: string;
  ownerId: string;
  sourceUserId: string;
  targetUserId: string;
  relationshipType: RelationshipType;
  note: string;
  createdAt: string;
}

export interface PrivateMixedConnectionEdge {
  id: string;
  ownerId: string;
  placeholderId: string;
  userId: string;
  relationshipType: RelationshipType;
  note: string;
  createdAt: string;
}

export interface ClaimCandidate {
  placeholderId: string;
  name: string;
  email: string;
  phoneNumber: string;
  relationshipType: RelationshipType;
  note: string;
  ownerId: string;
  ownerName: string;
  ownerHandle: string;
  mutualConnectionNames: string[];
  mutualConnectionCount: number;
  matchReasons: string[];
}
