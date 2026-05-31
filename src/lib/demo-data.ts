import { DEMO_USER_ID } from "@/lib/demo-mode";
import type {
  PlaceholderPerson,
  Relationship,
  User,
} from "@/types/models";

const now = new Date("2026-05-23T12:00:00.000Z").toISOString();

export const demoUsers: User[] = [
  {
    id: DEMO_USER_ID,
    name: "Demo User",
    firstName: "Demo",
    lastName: "User",
    handle: "sydney.demo",
    pronouns: "She/Her",
    bio: "Mapping a consent-first private network for review.",
    interests: ["community", "events", "relationship maps"],
    relationshipStatus: "connected",
    location: "New York City, NY",
    links: { website: "https://meshylinks.com" },
    featured: true,
    isPro: true,
    connectionScore: 64,
    totalConnections: 8,
    secondDegreeConnections: 21,
    profileImage: null,
  },
];

export const demoRelationships: Relationship[] = [];

export const demoPrivatePlaceholders: PlaceholderPerson[] = [
  {
    id: "demo-private-ivy",
    ownerId: DEMO_USER_ID,
    name: "Ivy Morgan",
    offerToNameMatch: true,
    email: "ivy@example.com",
    phoneNumber: "+15551234567",
    relationshipType: "Talking",
    note: "Met at a rooftop dinner.",
    inviteToken: "demo-ivy-invite",
    linkedUserId: null,
    claimStatus: "invited",
    createdAt: now,
  },
  {
    id: "demo-private-cam",
    ownerId: DEMO_USER_ID,
    name: "Cam Rivera",
    offerToNameMatch: true,
    email: "",
    phoneNumber: "",
    relationshipType: "Exes",
    note: "Old connection, keep private for now.",
    inviteToken: null,
    linkedUserId: null,
    claimStatus: "unclaimed",
    createdAt: now,
  },
  {
    id: "demo-private-jules",
    ownerId: DEMO_USER_ID,
    name: "Jules Avery",
    offerToNameMatch: false,
    email: "jules@example.com",
    phoneNumber: "",
    relationshipType: "Situationship",
    note: "Needs confirmation before public chart.",
    inviteToken: null,
    linkedUserId: null,
    claimStatus: "unclaimed",
    createdAt: now,
  },
];

export const demoProfile = {
  name: "Demo User",
  handle: "sydney.demo",
  pronouns: "She/Her",
  bio: "Mapping a consent-first private network for review.",
  location: "New York City, NY",
  relationshipStatus: "connected",
  interests: ["community", "events", "relationship maps"],
};
