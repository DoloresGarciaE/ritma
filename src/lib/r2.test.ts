import { afterEach, describe, expect, it } from "vitest";

import {
  isR2Configured,
  MAX_ATTACHMENT_BYTES,
  paymentAttachmentKey,
  validateAttachment,
} from "./r2";

/**
 * Las partes PURAS de la capa de adjuntos: el scope de la key, la validación y el gate
 * de configuración. Las URLs firmadas no se testean acá (exigirían credenciales o mocks
 * del SDK); la verificación de permisos vive en las actions, que buscan el pago vía
 * withOrg — cubierto por los tests de aislamiento.
 */

const R2_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
const saved = new Map(R2_VARS.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("paymentAttachmentKey", () => {
  it("SIEMPRE lleva la org adelante: el scope va en el nombre", () => {
    expect(paymentAttachmentKey("org_a", "pay_1")).toBe("org_a/payments/pay_1");
  });
});

describe("isR2Configured", () => {
  it("solo con las CUATRO env vars presentes", () => {
    for (const name of R2_VARS) delete process.env[name];
    expect(isR2Configured()).toBe(false);

    process.env.R2_ACCOUNT_ID = "cuenta";
    process.env.R2_ACCESS_KEY_ID = "key";
    process.env.R2_SECRET_ACCESS_KEY = "secreto";
    expect(isR2Configured()).toBe(false); // falta el bucket

    process.env.R2_BUCKET = "ritma-dev";
    expect(isR2Configured()).toBe(true);
  });
});

describe("validateAttachment", () => {
  it("acepta imágenes razonables, incluidas las HEIC de iPhone", () => {
    expect(validateAttachment("image/jpeg", 1024)).toBeNull();
    expect(validateAttachment("image/png", 5 * 1024 * 1024)).toBeNull();
    expect(validateAttachment("image/heic", 1024)).toBeNull();
    expect(validateAttachment("image/jpeg", MAX_ATTACHMENT_BYTES)).toBeNull();
  });

  it("rechaza lo que no es imagen (un PDF, un ejecutable) con mensaje concreto", () => {
    expect(validateAttachment("application/pdf", 1024)).toMatch(/tiene que ser una imagen/);
    expect(validateAttachment("text/html", 10)).toMatch(/tiene que ser una imagen/);
  });

  it("rechaza tamaños imposibles o excesivos", () => {
    expect(validateAttachment("image/jpeg", 0)).toMatch(/No se pudo leer/);
    expect(validateAttachment("image/jpeg", MAX_ATTACHMENT_BYTES + 1)).toMatch(/muy pesada/);
  });
});
