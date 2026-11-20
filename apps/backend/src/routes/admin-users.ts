import { Router } from "express";
import { hasuraRequest } from "../lib/hasura";

const LIST_USERS = `
  query AdminUsers {
    users(order_by: { created_at: desc }) {
      id
      email
      first_name
      last_name
      created_at
      updated_at
    }
  }
`;
interface UserRow { id: string; email: string | null; first_name: string | null; last_name: string | null; created_at: string; updated_at: string; }
export const adminUsersRouter = Router();
adminUsersRouter.get("/", async (_req, res) => {
  try {
    const data = await hasuraRequest<{ users: UserRow[] }>(LIST_USERS);
    return res.json({ users: data.users.map(({ id, email, first_name, last_name, created_at, updated_at }) => ({ id, email, firstName: first_name, lastName: last_name, joinedDate: created_at, updatedAt: updated_at })) });
  } catch (error) {
    console.error("admin-users: directory query failed", error);
    return res.status(502).json({ error: "Unable to load the user directory" });
  }
});
