export type RelationshipType =
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
}
