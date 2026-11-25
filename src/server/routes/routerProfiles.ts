import { Router } from 'express';
import { RouterProfileController } from '../controllers/RouterProfileController';

const router = Router();

router.post('/profiles', RouterProfileController.create);
router.put('/profiles', RouterProfileController.update);
router.delete('/profiles', RouterProfileController.delete);

export default router;
