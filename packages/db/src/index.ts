export { closeDb, findRepoRoot, getDb, openDb, type Db, type OpenDbOptions } from './client';
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
export {
  availabilitySlots,
  availabilitySnapshots,
  policyEvidences,
  rooms,
  type AvailabilitySlotRow,
  type AvailabilitySnapshot,
  type PolicyEvidence,
  type Room,
} from './schema';
export { loadAvailability, recordAvailabilityError, saveAvailability, type SaveAvailabilityInput } from './availability';
