/// <reference lib="webworker" />
import { WorkerRuntime } from './runtime';
import type { WorkerRequest } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const runtime = new WorkerRuntime((message, transfer = []) => scope.postMessage(message, transfer));
scope.onmessage = (event: MessageEvent<WorkerRequest>) => runtime.handle(event.data);
