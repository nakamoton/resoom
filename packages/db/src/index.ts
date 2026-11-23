export {
  closeDb,
  disposeDb,
  findRepoRoot,
  getDb,
  migratePostgres,
  migrationsFolder,
  openDb,
  openPostgres,
  usesPostgres,
  type Db,
  type OpenDbOptions,
} from './client';
export {
  DuplicateRoomError,
  addEvidence,
  createRoom,
  getRoom,
  importSeed,
  listMunicipalities,
  listRooms,
  updateRoomBasics,
  type RoomWithEvidences,
  type SeedRoom,
} from './rooms';
export { loadAvailability, recordAvailabilityError, saveAvailability, type SaveAvailabilityInput } from './availability';
export { MemberError, changeMemberRole, ensureAdmins, getMember, inviteMember, listMembers, removeMember } from './members';
export * as schema from './schema';
export {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
  availabilitySlots,
  availabilitySnapshots,
  members,
  policyEvidences,
  rooms,
  type AvailabilitySlotRow,
  type AvailabilitySnapshot,
  type Member,
  type PolicyEvidence,
  type Room,
} from './schema';
