import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { errorHandler } from "../../../src/middlewares/errorHandler.js";
import { NotFoundError } from "../../../src/shared/errors/app-error.js";

function makeRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { status, json };
}

function invoke(err: unknown) {
  const res = makeRes();
  errorHandler(
    err as Error,
    {} as Parameters<typeof errorHandler>[1],
    res as Parameters<typeof errorHandler>[2],
    vi.fn() as Parameters<typeof errorHandler>[3],
  );
  return res;
}

describe("errorHandler", () => {
  it("maneja AppError con su statusCode y code", () => {
    const res = invoke(new NotFoundError("Order"));

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: "NOT_FOUND", message: "Order no encontrado" },
    });
  });

  it("P2002 (unique constraint) → 409 CONFLICT", () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["email"] },
      },
    );

    const res = invoke(err);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "CONFLICT",
        message: "Ya existe un registro con el mismo valor en: email",
      },
    });
  });

  it("P2003 (foreign key) → 409 CONFLICT", () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      "Foreign key constraint failed",
      {
        code: "P2003",
        clientVersion: "test",
        meta: { field_name: "orders_shippingAddressId_fkey" },
      },
    );

    const res = invoke(err);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "CONFLICT",
        message: "La operación viola una restricción de datos existente",
      },
    });
  });

  it("P2025 (record no encontrado) → 404 NOT_FOUND", () => {
    const err = new Prisma.PrismaClientKnownRequestError("Record not found", {
      code: "P2025",
      clientVersion: "test",
      meta: { modelName: "Order" },
    });

    const res = invoke(err);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "El registro que se intenta modificar no existe",
      },
    });
  });

  it("código Prisma desconocido (P1000) → 500 INTERNAL_ERROR", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Prisma.PrismaClientKnownRequestError("Connection error", {
      code: "P1000",
      clientVersion: "test",
    });

    const res = invoke(err);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });

  it("error genérico → 500 INTERNAL_ERROR y log del error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("boom");

    const res = invoke(boom);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
    expect(spy).toHaveBeenCalledWith("Unhandled error:", boom);

    spy.mockRestore();
  });
});
