type MessageTask = () => Promise<any>;

class MessageQueueManager {
  private queue: MessageTask[] = [];
  private isProcessing = false;

  public enqueue(task: MessageTask): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const res = await task();
          resolve(res);
        } catch (err) {
          reject(err);
        }
      });
      this.processNext();
    });
  }

  private async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;
    const task = this.queue.shift();
    if (task) {
      try {
        await task();
      } catch (e) {
        console.warn("Message queue dispatch warning:", e);
      } finally {
        this.isProcessing = false;
        // 40ms safety debounce between rapid writes to guarantee sequential order and prevent rate-limiting
        setTimeout(() => this.processNext(), 40);
      }
    }
  }
}

export const messageQueue = new MessageQueueManager();
