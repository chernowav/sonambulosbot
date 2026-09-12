const express = require('express');
const { verifyChain } = require('../services/ledger');

// El libro es público a propósito: cualquiera puede leerlo sin sesión y
// recalcular la cadena por su cuenta. Lo que sale son las etiquetas
// ("Cherno @1758"), nunca los teléfonos completos.
function createLedgerRouter({ store }) {
  const router = express.Router();

  // Exactamente los campos que entran en el hash, más la descripción para
  // que se lea. Si faltara alguno, verificar desde afuera sería imposible.
  function publicEntry(entry) {
    return {
      index: entry.index,
      timestamp: entry.timestamp,
      action: entry.action,
      fromLabel: entry.fromLabel,
      toLabel: entry.toLabel,
      amount: entry.amount,
      prevHash: entry.prevHash,
      hash: entry.hash,
      description: entry.description,
    };
  }

  router.get('/libro', async (req, res) => {
    const entries = await store.listLedger({
      limit: Number(req.query.limit) || 50,
      before: req.query.before,
    });

    res.json({ entries: entries.map(publicEntry) });
  });

  router.get('/libro/resumen', async (req, res) => {
    res.json(await store.ledgerSummary());
  });

  // Verificación del lado del servidor. No reemplaza a la del navegador: la
  // gracia del libro es justamente que no haga falta creerle a esta ruta.
  router.get('/libro/verificar', async (req, res) => {
    const entries = await store.listLedgerInOrder();
    res.json(verifyChain(entries.map(publicEntry)));
  });

  return router;
}

module.exports = { createLedgerRouter };
