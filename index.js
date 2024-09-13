const express = require("express");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const { query, validationResult } = require("express-validator");

const app = express();
const PORT = process.env.PORT || 3000;

// Usar Helmet para agregar headers de seguridad
app.use(helmet());

// Configurar límite de velocidad: 1 solicitud cada 5 segundos (5000 ms)
const limiter = rateLimit({
  windowMs: 5 * 1000, // 5 segundos
  max: 1, // Límite de 1 solicitud por IP
  message:
    "Demasiadas solicitudes, por favor espera 5 segundos antes de intentar nuevamente.",
});

// Ruta "/launches" con validación de limit y offset
app.get(
  "/launches",
  limiter, // Aplicar limitador
  [
    // Validar limit (entero opcional y mayor a 0)
    query("limit")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Limit debe ser un entero mayor que 0."),

    // Validar offset (entero opcional y mayor o igual a 0)
    query("offset")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Offset debe ser un entero mayor o igual a 0."),

    // Validar que no se reciban otros parámetros no deseados
    (req, res, next) => {
      const allowedParams = ["limit", "offset"];
      const queryKeys = Object.keys(req.query);
      const invalidParams = queryKeys.filter(
        (param) => !allowedParams.includes(param)
      );

      if (invalidParams.length > 0) {
        return res.status(400).json({
          message: `Los siguientes parámetros no están permitidos: ${invalidParams.join(
            ", "
          )}`,
        });
      }

      next();
    },
  ],
  async (req, res) => {
    // Manejar errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Extraer limit y offset del request query
    const limit = req.query.limit ? parseInt(req.query.limit) : 200; // Valor por defecto: 10
    const offset = req.query.offset ? parseInt(req.query.offset) : 0; // Valor por defecto: 0

    try {
      // Obtener los datos de lanzamientos
      let launches = [];
      try {
        const launchesResponse = await axios.get(
          "https://api.spacexdata.com/v3/launches"
        );
        launches = launchesResponse.data;
      } catch (error) {
        console.error("Error al obtener los datos de launches:", error);
        return res
          .status(500)
          .json({ message: "Error al obtener los datos de launches" });
      }

      // Obtener los datos de cohetes
      let rockets = [];
      try {
        const rocketsResponse = await axios.get(
          "https://api.spacexdata.com/v3/rockets"
        );
        rockets = rocketsResponse.data;
      } catch (error) {
        console.error("Error al obtener los datos de rockets:", error);
        return res
          .status(500)
          .json({ message: "Error al obtener los datos de rockets" });
      }

      // Crear un mapa de cohetes con clave por rocket_id
      const rocketsMap = rockets.reduce((map, rocket) => {
        map[rocket.rocket_id] = {
          rocket_id: rocket.rocket_id,
          rocket_name: rocket.rocket_name,
          description: rocket.description,
          images: rocket.flickr_images,
        };
        return map;
      }, {});

      // Transformar los datos de lanzamientos
      const transformedLaunches = launches.map((launch) => ({
        flight_number: launch.flight_number,
        mission_name: launch.mission_name,
        rocket: rocketsMap[launch.rocket.rocket_id] || {},
        payloads: launch.rocket.second_stage.payloads.map((payload) => ({
          payload_id: payload.payload_id,
          manufacturer: payload.manufacturer,
          type: payload.payload_type,
        })),
      }));

      // Aplicar paginación con limit y offset
      const paginatedLaunches = transformedLaunches.slice(
        offset,
        offset + limit
      );

      // Responder con los lanzamientos paginados
      res.json(paginatedLaunches);
    } catch (error) {
      console.error("Error inesperado:", error);
      res.status(500).send("Error Interno del Servidor");
    }
  }
);

// Iniciar el servidor en el puerto configurado
app.listen(PORT, () => {
  console.log(`El servidor está corriendo en el puerto ${PORT}`);
});
