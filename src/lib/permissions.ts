import type { AppState, Mission, Partner } from "./types";

/**
 * Kto może edytować (to samo, co sprawdza baza w v6 — `can_edit_mission` / `can_edit_partner`).
 * `enforce` = chmura z migracją v6 (bez niej baza nikogo nie ogranicza, więc widok też nie).
 * Tryb demo — wszystko. Misja bez właściciela albo właściciela spoza zespołu — każdy.
 */
function ownerOutsideTeam(state: AppState, ownerId: string) {
  // Bez listy zespołu nie wiemy, kto w nim jest — wtedy decyduje sama baza.
  if (!state.team.length) return true;
  return !state.team.some((member) => member.id === ownerId);
}

export function canEditMission(state: AppState, mission: Pick<Mission, "ownerUserId">, enforce: boolean) {
  if (!enforce || !state.user.id) return true;
  const owner = mission.ownerUserId;
  if (!owner || owner === state.user.id || state.user.isAdmin) return true;
  return ownerOutsideTeam(state, owner);
}

export function canEditPartner(state: AppState, partner: Pick<Partner, "id" | "ownerUserId">, enforce: boolean) {
  if (!enforce || !state.user.id) return true;
  const owner = partner.ownerUserId;
  if (!owner || owner === state.user.id || state.user.isAdmin) return true;
  if (state.missions.some((m) => m.partnerId === partner.id && m.ownerUserId === state.user.id)) return true;
  return ownerOutsideTeam(state, owner);
}
