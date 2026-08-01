import type { Server } from "socket.io";

export type RedisLocalEmitter = (
  roomName: string,
  eventName: string,
  payload: unknown,
) => void;

export function createRedisLocalEmitter(
  io: Pick<Server, "local">,
): RedisLocalEmitter {
  // Domain Redis Pub/Sub already delivers the event to every Realtime Task.
  return (roomName, eventName, payload) => {
    io.local.to(roomName).emit(eventName, payload);
  };
}
