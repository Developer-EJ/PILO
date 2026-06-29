export interface DatabasePort {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
