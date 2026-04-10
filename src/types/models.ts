export type RelationshipType =
  | "friends"
  | "married"
  | "exes"
  | "collaborators"
  | "roommates"
  | "crushes"
  | "mentors";

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

export interface Event {
  id: string;
  title: string;
  date: string;
  location: string;
  description: string;
  attendees: number;
  type: string;
}

export interface Article {
  id: string;
  title: string;
  excerpt: string;
  authorId: string;
  category: string;
  readTime: string;
  publishedAt: string;
}

export interface Relationship {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  note: string;
}
