import request from "supertest";
import { app } from "./index";

describe("backend HTTP routes", () => {
  it("reports service health", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "truestub-backend",
    });
  });
});
