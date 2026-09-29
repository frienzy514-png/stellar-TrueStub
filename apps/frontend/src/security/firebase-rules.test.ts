import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

let testEnvironment: RulesTestEnvironment;

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: "demo-truestub-rules",
    firestore: {
      rules: readFileSync(join(__dirname, "../../firestore.rules"), "utf8"),
    },
    storage: {
      rules: readFileSync(join(__dirname, "../../storage.rules"), "utf8"),
    },
  });

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/user-b/private"), { private: true });
    await uploadBytes(ref(context.storage(), "users/user-b/private.txt"), new Uint8Array([1]));
  });
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

it("denies a signed-in user access to another user's Firestore documents", async () => {
  const database = testEnvironment.authenticatedContext("user-a").firestore();
  const otherUsersDocument = doc(database, "users/user-b/private");

  await assertFails(getDoc(otherUsersDocument));
  await assertFails(setDoc(otherUsersDocument, { private: true }));
});

it("denies a signed-in user access to another user's Storage objects", async () => {
  const storage = testEnvironment.authenticatedContext("user-a").storage();
  const otherUsersObject = ref(storage, "users/user-b/private.txt");

  await assertFails(getBytes(otherUsersObject));
  await assertFails(uploadBytes(otherUsersObject, new Uint8Array([1])));
});