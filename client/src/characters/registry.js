import { DEFAULT_CHARACTER } from '../../shared/characters/definitions.js';
import { RobotModel } from './RobotModel.js';
import { SquirrelModel } from './SquirrelModel.js';
import { MarioModel } from './MarioModel.js';
import { DrOctopusModel } from './DrOctopusModel.js';

// Character id (shared/characters/definitions.js) -> model class
const MODELS = {
    robot: RobotModel,
    squirrel: SquirrelModel,
    mario: MarioModel,
    'doctor-octopus': DrOctopusModel
};

export function createCharacterModel(characterId) {
    const Model = MODELS[characterId] || MODELS[DEFAULT_CHARACTER];
    return new Model();
}
