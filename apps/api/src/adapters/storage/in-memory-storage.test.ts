import { createInMemoryStorage } from "./in-memory-storage";
import { describeObjectStorage } from "./testing/storage-contract";

describeObjectStorage("in-memory", createInMemoryStorage(), "test/");
