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

    user.isAdmin = true;
    user.balance = 100; // Mínimo recomendado
    await user.save();

    res.json({ message: `✅ Admin habilitado para ${treasurerPhone}`, balance: user.balance });
  });

  return router;
}

module.exports = { createAdminRouter };
