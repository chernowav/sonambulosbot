const express = require('express');

function createAdminRouter({ store, config }) {
  const router = express.Router();

  router.post('/setup', async (req, res) => {
    const { password, treasurerPhone } = req.body;

    if (password !== config.adminPassword) {
      return res.status(403).json({ error: 'Contraseña incorrecta' });
    }

    const user = await store.getUser(treasurerPhone);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Solo habilita el rol. Antes también le regalaba 100 monedas, que ahora
    // serían Luna salidas de la nada y sin movimiento en el libro: el
    // tesorero se recarga con /recarga, que sí queda registrado.
    user.isAdmin = true;
    await user.save();

    res.json({ message: `✅ Admin habilitado para ${treasurerPhone}` });
  });

  return router;
}

module.exports = { createAdminRouter };
