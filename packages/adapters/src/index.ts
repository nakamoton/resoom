export type { AvailabilitySlot, RoomInfo, SlotStatus } from './types';
export { OtaClient, assertServiceHours } from './ota/client';
export type { FetchAvailabilityParams, FetchAvailabilityResult, OtaClientOptions } from './ota/client';
export { parseAvailability, parseRoomList } from './ota/parse';
