import type { PrivateDuplicateMatch } from "@/lib/private-duplicate-matches";

export function chooseExistingPrivatePerson(match: PrivateDuplicateMatch) {
  return {
    createNewPerson: false,
    existingPersonId: match.id,
    message: `Using existing private person: ${match.name}. No new person was created.`,
  };
}

export function chooseCreateNewPersonAnyway() {
  return {
    createNewPerson: true,
    existingPersonId: null,
  };
}
