import { describe, expect, it } from "vitest";
import {
  findPrivateDuplicateMatches,
  type PrivateDuplicateCandidate,
} from "@/lib/private-duplicate-matches";
import {
  chooseCreateNewPersonAnyway,
  chooseExistingPrivatePerson,
} from "@/lib/private-duplicate-flow";

const baseCandidate: PrivateDuplicateCandidate = {
  id: "placeholder_1",
  ownerId: "owner_1",
  name: "Jordan Lee",
  email: null,
  phoneNumber: null,
  relationshipType: "Friends",
  note: null,
  claimStatus: "unclaimed",
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  linkedUser: null,
};

describe("findPrivateDuplicateMatches", () => {
  it("finds an exact email match with normalized casing", () => {
    const matches = findPrivateDuplicateMatches(
      { name: "Someone Else", email: "JORDAN@example.com" },
      [{ ...baseCandidate, email: "jordan@example.com" }],
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.reasons).toContain("Exact email match");
  });

  it("finds an exact phone match after stripping formatting", () => {
    const matches = findPrivateDuplicateMatches(
      { name: "Someone Else", phoneNumber: "(555) 867-5309" },
      [{ ...baseCandidate, phoneNumber: "5558675309" }],
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.reasons).toContain("Exact phone match");
  });

  it("finds a similar name match", () => {
    const matches = findPrivateDuplicateMatches(
      { name: "Jordan Leigh" },
      [{ ...baseCandidate, name: "Jordan Lee" }],
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.reasons).toContain("Similar name");
  });

  it("returns multiple likely matches sorted by score", () => {
    const matches = findPrivateDuplicateMatches(
      {
        name: "Jordan Lee",
        email: "jordan@example.com",
        phoneNumber: "555-111-2222",
      },
      [
        { ...baseCandidate, id: "name_match", name: "Jordan Leigh" },
        { ...baseCandidate, id: "email_match", email: "jordan@example.com" },
        { ...baseCandidate, id: "phone_match", phoneNumber: "5551112222" },
      ],
    );

    expect(matches.map((match) => match.id)).toEqual([
      "email_match",
      "phone_match",
      "name_match",
    ]);
  });

  it("returns no matches for unrelated people", () => {
    const matches = findPrivateDuplicateMatches(
      { name: "Avery Stone", email: "avery@example.com" },
      [{ ...baseCandidate, name: "Morgan Patel", email: "morgan@example.com" }],
    );

    expect(matches).toEqual([]);
  });
});

describe("private duplicate choices", () => {
  const [match] = findPrivateDuplicateMatches(
    { name: "Jordan Lee", email: "jordan@example.com" },
    [{ ...baseCandidate, email: "jordan@example.com" }],
  );

  it("uses an existing person only when explicitly chosen", () => {
    const choice = chooseExistingPrivatePerson(match!);

    expect(choice).toEqual({
      createNewPerson: false,
      existingPersonId: "placeholder_1",
      message:
        "Using existing private person: Jordan Lee. No new person was created.",
    });
  });

  it("keeps creating a new person available when chosen anyway", () => {
    expect(chooseCreateNewPersonAnyway()).toEqual({
      createNewPerson: true,
      existingPersonId: null,
    });
  });
});
