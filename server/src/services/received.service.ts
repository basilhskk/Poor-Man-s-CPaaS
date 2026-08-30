import type {
  ReceivedRepo,
  ReceivedRow,
} from "../repositories/received.repo.js";
import type { UserRepo } from "../repositories/user.repo.js";
import type { ReceivedSmsItem } from "../validators/received.validator.js";
import { fireWebhook } from "../webhook.js";

export function createReceivedService(repo: ReceivedRepo, userRepo: UserRepo) {
  return {
    async storeBatch(
      items: ReceivedSmsItem[],
      deviceId: string,
      userId: string,
    ): Promise<ReceivedRow[]> {
      const rows = await Promise.all(
        items.map((item) =>
          repo.insert({
            deviceId,
            fromNumber: item.from,
            body: item.body,
            receivedAt: new Date(item.receivedAt),
            webhookDelivered: false,
          }),
        ),
      );

      const user = await userRepo.findById(userId);
      const webhookUrl = user?.webhookUrl;

      if (webhookUrl) {
        const secret = user?.webhookSecret ?? null;
        for (const row of rows) {
          fireWebhook(
            webhookUrl,
            {
              event: "sms.received",
              data: {
                id: row.id,
                from: row.fromNumber,
                body: row.body,
                receivedAt: row.receivedAt,
              },
            },
            secret,
          );
          await repo.markDelivered(row.id);
        }
      }

      return rows;
    },

    async listByUser(
      userId: string,
      options: { page: number; pageSize: number },
    ): Promise<ReceivedRow[]> {
      return repo.listByUser(userId, options);
    },
  };
}

export type ReceivedService = ReturnType<typeof createReceivedService>;
