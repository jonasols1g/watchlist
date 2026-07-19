import { describe, expect, it, vi } from "vitest";
import { FirestoreFeedbackStorage } from "./FirestoreFeedbackStorage";

const addDocMock = vi.fn().mockResolvedValue({ id: "generated-id" });
const collectionMock = vi.fn().mockReturnValue("feedback-collection-ref");

vi.mock("firebase/firestore/lite", () => ({
  addDoc: (...args: unknown[]): unknown => addDocMock(...args) as unknown,
  collection: (...args: unknown[]): unknown => collectionMock(...args) as unknown,
}));

describe("FirestoreFeedbackStorage", () => {
  it("skriver til den top-level 'feedback'-collectionen med addDoc (auto-ID)", async () => {
    const firestore = {} as never;
    const storage = new FirestoreFeedbackStorage(firestore);

    await storage.submit({ text: "Veldig bra!", score: 5 });

    expect(collectionMock).toHaveBeenCalledExactlyOnceWith(firestore, "feedback");
    expect(addDocMock).toHaveBeenCalledExactlyOnceWith(
      "feedback-collection-ref",
      expect.objectContaining({ text: "Veldig bra!", score: 5 }),
    );
  });

  it("setter createdAt som en ISO-streng", async () => {
    const storage = new FirestoreFeedbackStorage({} as never);

    await storage.submit({ text: "Test", score: 3 });

    const [, data] = addDocMock.mock.calls[addDocMock.mock.calls.length - 1] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(typeof data.createdAt).toBe("string");
    expect(new Date(data.createdAt as string).toISOString()).toBe(
      data.createdAt,
    );
  });

  it("propagerer feil fra addDoc (håndteres av FeedbackPage)", async () => {
    addDocMock.mockRejectedValueOnce(new Error("network"));
    const storage = new FirestoreFeedbackStorage({} as never);

    await expect(storage.submit({ text: "Feiler", score: 1 })).rejects.toThrow(
      "network",
    );
  });
});
