import { Router } from "express";
import { container } from "../../di/container.js";

const { paymentController } = container;

const router = Router();

router.post("/webhook", paymentController.webhook);

// TODO: ruta temporal solo para pruebas de desarrollo, reemplazar por la URL real del frontend cuando exista.
router.get("/redirect", (req, res) => {
  res.json({
    success: true,
    data: {
      message: "Redirect de prueba recibido, esto es temporal",
      receivedParams: req.query,
    },
  });
});

export { router as paymentRoutes };
