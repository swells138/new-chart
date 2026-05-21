// TEMP A2P REVIEW PAGE - SAFE TO DELETE AFTER APPROVAL

export type DemoApprovalState =
  | "Approved"
  | "Waiting for approval"
  | "Connection request pending"
  | "Not yet invited";

export type DemoRelationshipType =
  | "Friend"
  | "Dating"
  | "Coworker"
  | "Family"
  | "Known contact";

export interface DemoNode {
  id: string;
  name: string;
  relationship: DemoRelationshipType;
  status: string;
  approvalState: DemoApprovalState;
  color: string;
  x: number;
  y: number;
}

export const demoNodes: DemoNode[] = [
  {
    id: "alex",
    name: "Alex Morgan",
    relationship: "Friend",
    status: "Connected",
    approvalState: "Approved",
    color: "#66b6a7",
    x: 50,
    y: 48,
  },
  {
    id: "taylor",
    name: "Taylor Reed",
    relationship: "Friend",
    status: "Invited",
    approvalState: "Waiting for approval",
    color: "#ffbb6f",
    x: 73,
    y: 28,
  },
  {
    id: "jordan",
    name: "Jordan Lee",
    relationship: "Coworker",
    status: "Pending",
    approvalState: "Connection request pending",
    color: "#9b8cff",
    x: 31,
    y: 30,
  },
  {
    id: "casey",
    name: "Casey Brooks",
    relationship: "Known contact",
    status: "Private draft",
    approvalState: "Not yet invited",
    color: "#ff8f84",
    x: 26,
    y: 70,
  },
  {
    id: "riley",
    name: "Riley Chen",
    relationship: "Family",
    status: "Connected",
    approvalState: "Approved",
    color: "#63b1ff",
    x: 70,
    y: 73,
  },
];

export const demoInviteDefaults = {
  recipientName: "Taylor Reed",
  phoneNumber: "555-010-1234",
  relationshipType: "Friend",
  note: "Hey Taylor, join me on MeshyLinks so we can confirm our connection.",
};

export const sampleSmsMessages = [
  {
    label: "Invitation SMS",
    body: "Alex invited you to join MeshyLinks and connect on the platform. Create your account here: https://meshylinks.com/invite/demo Reply HELP for help or STOP to opt out.",
  },
  {
    label: "Connection Request SMS",
    body: "Alex requested to connect with you on MeshyLinks. Review and approve here: https://meshylinks.com/connect/demo Reply HELP for help or STOP to opt out.",
  },
  {
    label: "Verification Code SMS",
    body: "Your MeshyLinks verification code is 123456. This code expires in 10 minutes.",
  },
];
