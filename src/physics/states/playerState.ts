import { Bot, ControlState, ControlStateStatus, Effect, GameMode } from "mineflayer";
import { AABB } from "@nxg-org/mineflayer-util-plugin";
import { Vec3 } from "vec3";
import {
    CheapEffects,
    CheapEnchantments,
    getStatusEffectNamesForVersion,
    isEntityUsingItem,
    isUsableElytraItem,
    makeSupportFeature,
    whichHandIsEntityUsing,
    whichHandIsEntityUsingBoolean,
} from "../../util/physicsUtils";
// import { bot.entity } from "prismarine-entity";
import md from "minecraft-data";
import { ControlStateHandler } from "../player/playerControls";
import { IEntityState, NearbyEntity } from "./iEntityState";
import { IPhysics } from "../engines/IPhysics";
import type { Entity } from "prismarine-entity";
import { PlayerPoses, getCollider, playerPoseSize } from "./poses";
import { Heading, getPose } from "./entityPose";


export function convInpToAxes(player: PlayerState): Heading {
    return {
      forward: (player.control.forward as unknown as number) - (player.control.back as unknown as number),
      strafe: (player.control.left as unknown as number) - (player.control.right as unknown as number),
    };
  }

//Utility class that wraps PlayerPoses.
export class EntityDimensions {
    public readonly width: number;
    public readonly height: number;
    public readonly fixed: boolean;

    constructor(width: number, height: number, fixed: boolean) {
        this.width = width;
        this.height = height;
        this.fixed = fixed;
    }

    public static scalable(f: number, f2: number): EntityDimensions {
        return new EntityDimensions(f, f2, false);
    }

    public static fixed(f: number, f2: number): EntityDimensions {
        return new EntityDimensions(f, f2, true);
    }

    makeBoundingBox(vec3: Vec3): AABB {
        return this.makeBoundingBoxCoords(vec3.x, vec3.y, vec3.z);
    }

    public makeBoundingBoxCoords(d: number, d2: number, d3: number): AABB {
        const f = this.width / 2.0;
        const f2 = this.height;
        return new AABB(d - f, d2, d3 - f, d + f, d2 + f2, d3 + f);
    }

    public scale(f: number): EntityDimensions {
        return this.scaleRaw(f, f);
    }

    public scaleRaw(f: number, f2: number): EntityDimensions {
        if (this.fixed || (f == 1.0 && f2 == 1.0)) {
            return this;
        }
        return EntityDimensions.scalable(this.width * f, this.height * f2);
    }

    public toString(): string {
        return "EntityDimensions w=" + this.width + ", h=" + this.height + ", fixed=" + this.fixed;
    }
}

/**
 * Looking at this code, it's too specified towards players.
 *
 * I will eventually split this code into PlayerState and bot.entityState, where bot.entityState contains fewer controls.
 */
export class PlayerState implements IEntityState {
    public readonly bot: Bot; // needed to clone.
    public age: number = 0;
    // public height: number = 1.8;
    // public eyeHeight: number = 1.62;
    // public halfWidth: number = 0.3;
    public pos: Vec3;
    public vel: Vec3;

    public onGround: boolean = false;
    public lastOnGround: boolean = false;
    public onClimbable: boolean = false;
    public isInWater: boolean = false;
    public isUnderWater: boolean = false;
    /** Whether the eyes were in water at the last tick start (vanilla's fluidOnEyes); undefined before the first. */
    public eyeInWater?: boolean;
    /** How deep the box is in water and in lava (vanilla's getFluidHeight), from the last fluid update. */
    public waterHeight: number = 0;
    public lavaHeight: number = 0;
    public isInLava: boolean = false;
    public isUnderLava: boolean = false;
    public isInWeb: boolean = false;
    public validElytraEquipped: boolean = false;
    /** PowderSnowBlock.canEntityWalkOnPowderSnow: leather boots on the feet. */
    public canWalkOnPowderSnow: boolean = false;
    public fireworkRocketDuration: number = 0;
    /** How many rockets fly attached to the player this tick, each boosting it (0: one while the duration runs). */
    public fireworkRockets: number = 0;
    /** How many of those the client ticks before the player (its entity list order), boosting before its tick. */
    public fireworkRocketsBeforePlayer: number = 0;
    public isCollidedHorizontally: boolean = false;
    public isCollidedHorizontallyMinor: boolean = false;
    public isCollidedVertically: boolean = false;
    public supportingBlockPos: Vec3 | null = null;
    /** Entity.fallDistance: how far the player has fallen since it was last on ground (or reset). */
    public fallDistance: number = 0;
    /** LivingEntity.getScale: the scale attribute (1.20.5+), which sizes the player's box and eyes. */
    public scale: number = 1;
    /** Entity.isInPowderSnow: touched powder snow in the last block effects; wasInPowderSnow: in the tick before. */
    public isInPowderSnow: boolean = false;
    public wasInPowderSnow: boolean = false;
    /**
     * Before 1.17: the bounding box vanilla keeps across ticks (the engine's last move left it here), with the position
     * and size it was left with. The engine starts from it while pos is still that position, else builds it from pos.
     */
    public keptBoundingBox: { bb: AABB; pos: Vec3; width: number; height: number } | null = null;
    public stuckSpeedMultiplier: Vec3 = new Vec3(0, 0, 0);
    /** The other entities near the player (input only): the boats and shulkers it collides with, the mobs that push it. */
    public nearbyEntities: NearbyEntity[] = [];

    public jumpTicks: number = 0;
    public jumpQueued: boolean = false;
    public sprintTriggerTime: number = 0;
    /** The forward impulse of the tick before, slowed (before 1.21.5) or normalized (1.21.5+), not yet scaled by 0.98F. */
    public prevForwardImpulse: number = 0;
    /** The client's auto-jump option (1.11+), and LocalPlayer.autoJumpTime: a jump is pressed for the player next tick. */
    public autoJumpEnabled: boolean = false;
    public autoJumpTime: number = 0;
    public flyJumpTriggerTime: number = 0;

    public sneakCollision: boolean = false;

    public attributes: Entity["attributes"] /* dunno yet */ = {};
    public yaw: number = 0;
    public pitch: number = 0;
    /** The yaw in float degrees as vanilla holds it (bot.entity.yawDegrees), when the bot keeps it. */
    public yawDegrees?: number;
    // each state its own: the engine writes the keys of the tick before into prevControl
    public control: ControlStateHandler = ControlStateHandler.DEFAULT();
    public prevControl: ControlStateHandler = ControlStateHandler.DEFAULT();
    public heading: Heading = { forward: 0, strafe: 0 };
    public prevHeading: Heading = { forward: 0, strafe: 0 };

    public isUsingItem: boolean = false;
    public isUsingMainHand: boolean = false;
    public isUsingOffHand: boolean = false;

    public jumpBoost: number = 0;
    public speed: number = 0;
    public slowness: number = 0;
    public dolphinsGrace: number = 0;
    public slowFalling: number = 0;
    public levitation: number = 0;
    public blindness: number = 0;

    public depthStrider: number = 0;
    public swiftSneak: number = 0;
    public soulSpeed: number = 0;

    public effects: Effect[] = [];
    public statusEffectNames: ReturnType<typeof  getStatusEffectNamesForVersion>;

    public pose: PlayerPoses = PlayerPoses.STANDING;
    public gameMode: GameMode = "survival";

    public food: number = 0;

    // the below fields are abilities mineflayer is supposed to store.

    /**
     * TODO: proper impl.
     */
    public mayFly: boolean = false;

    /**
     * TODO: proper impl.
     */
    public flying: boolean = false;


    /**
     * TODO: proper impl.
     */
    public swimming: boolean = false;

    /**
     * TODO: proper impl.
     */
    public _sprinting: boolean = false;

    public get sprinting(): boolean {
        return this._sprinting;
    }

    public set sprinting(value: boolean) {
        // console.trace('set sprinting', value)
        this._sprinting = value;
    }

    /**
     * TODO: proper impl.
     */
    public crouching: boolean = false;

    /**
     * TODO: proper impl.
     */
    public fallFlying: boolean = false;

    /**
     * Deprecated compatibility alias for fallFlying.
     */
    public get elytraFlying(): boolean {
        return this.fallFlying;
    }

    public set elytraFlying(value: boolean) {
        this.fallFlying = value;
    }

    /**
     * TODO: proper impl.
     */
    public flySpeed: number = 0;

    public get onGroundWithoutSupportingBlock(): boolean {
        return this.onGround && !this.supportingBlockPos;
    }

    public get height(): number {
        return playerPoseSize(this.pose, this.scale).height;
    }

    public get eyeHeight(): number {
        const eyeHeight = this.unscaledEyeHeight;
        return this.scale === 1 || this.pose === PlayerPoses.SLEEPING ? eyeHeight : Math.fround(Math.fround(eyeHeight) * this.scale);
    }

    private get unscaledEyeHeight(): number {
        switch (this.pose) {
            case PlayerPoses.STANDING:
                return 1.62;
            case PlayerPoses.SNEAKING:
                return 1.27;
            case PlayerPoses.DYING:
            case PlayerPoses.SLEEPING:
            case PlayerPoses.SWIMMING:
            case PlayerPoses.FALL_FLYING:
            case PlayerPoses.SPIN_ATTACK:
                return 0.4;
            default:
                return 1.62;
        }
    }

    public get halfWidth(): number {
        return playerPoseSize(this.pose, this.scale).width / 2;
    }

    public readonly ctx: IPhysics;
    private readonly supportFeature: ReturnType<typeof makeSupportFeature>;

    constructor(ctx: IPhysics, bot: Bot, control?: ControlStateHandler) {
        this.supportFeature = makeSupportFeature(ctx.data);
        this.ctx = ctx;
        this.bot = bot;
        this.pos = bot.entity.position.clone();
        this.vel = bot.entity.velocity.clone();
        this.statusEffectNames = getStatusEffectNamesForVersion(this.supportFeature);
        this.update(bot, ControlStateHandler.COPY_BOT(bot));
    }

    public update(bot: Bot, control?: ControlStateHandler): PlayerState {
        // const bot.entity = bot instanceof bot.entity ? bot : bot.entity;
        // Input / Outputs
        this.pos.set(bot.entity.position.x, bot.entity.position.y, bot.entity.position.z);
        this.vel.set(bot.entity.velocity.x, bot.entity.velocity.y, bot.entity.velocity.z);
        this.supportingBlockPos = (bot.entity as any).supportingBlockPos ?? null;
        this.fallDistance = (bot.entity as any).fallDistance ?? 0;
        this.isInPowderSnow = (bot.entity as { isInPowderSnow?: boolean }).isInPowderSnow ?? false;
        this.onGround = bot.entity.onGround;
        this.lastOnGround = (bot.entity as any).lastOnGround ?? bot.entity.onGround;
        this.onClimbable = (bot.entity as any).onClimbable;
        this.isInWater = (bot.entity as any).isInWater;
        this.isUnderWater = (bot.entity as any).isUnderWater;
        this.eyeInWater = (bot.entity as { eyeInWater?: boolean }).eyeInWater;
        this.isInLava = (bot.entity as any).isInLava;
        this.isUnderLava = (bot.entity as any).isUnderLava;
        this.isInWeb = (bot.entity as any).isInWeb;
        this.validElytraEquipped = isUsableElytraItem(bot.inventory.slots[bot.getEquipmentDestSlot('torso')]);
        this.canWalkOnPowderSnow = bot.inventory.slots[bot.getEquipmentDestSlot('feet')]?.name === 'leather_boots';
        this.fireworkRocketDuration = bot.fireworkRocketDuration;
        // the rockets attached to the bot this tick, and how many of them the client ticks before it (when the bot says)
        this.fireworkRockets = (bot as { fireworkRockets?: number }).fireworkRockets ?? 0;
        this.fireworkRocketsBeforePlayer = (bot as { fireworkRocketsBeforePlayer?: number }).fireworkRocketsBeforePlayer ?? 0;
        this.isCollidedHorizontally = (bot.entity as any).isCollidedHorizontally;
        this.isCollidedHorizontallyMinor = (bot.entity as any).isCollidedHorizontallyMinor;
        this.isCollidedVertically = (bot.entity as any).isCollidedVertically;

        // dunno what to do about these, ngl.
        this.jumpTicks = (bot as any).jumpTicks ?? 0;
        this.jumpQueued = (bot as any).jumpQueued ?? false;
        this.flyJumpTriggerTime = (bot as any).flyJumpTriggerTime ?? 0;
        this.sprintTriggerTime = (bot as any).sprintTriggerTime ?? 0;
        this.autoJumpTime = (bot as unknown as { autoJumpTime?: number }).autoJumpTime ?? 0;

        // Input only (not modified)
        this.attributes = bot.entity.attributes;
        this.yaw = bot.entity.yaw;
        this.pitch = bot.entity.pitch;
        const yawDegrees = (bot.entity as { yawDegrees?: unknown }).yawDegrees;
        this.yawDegrees = yawDegrees == null ? undefined : Number(yawDegrees);
        this.control = control ?? ControlStateHandler.COPY_BOT(bot); // prevControl only updated internally.


        this.isUsingItem = bot.usingHeldItem/*  || isEntityUsingItem(bot.entity, this.ctx.supportFeature); */
        this.isUsingMainHand = !whichHandIsEntityUsingBoolean(bot.entity, this.ctx.supportFeature) && this.isUsingItem;
        this.isUsingOffHand = whichHandIsEntityUsingBoolean(bot.entity, this.ctx.supportFeature) && this.isUsingItem;

        // effects
        this.effects = bot.entity.effects;

        this.jumpBoost = this.ctx.getEffectLevel(CheapEffects.JUMP_BOOST, this.effects);
        this.speed = this.ctx.getEffectLevel(CheapEffects.SPEED, this.effects);
        this.slowness = this.ctx.getEffectLevel(CheapEffects.SLOWNESS, this.effects);

        this.dolphinsGrace = this.ctx.getEffectLevel(CheapEffects.DOLPHINS_GRACE, this.effects);
        this.slowFalling = this.ctx.getEffectLevel(CheapEffects.SLOW_FALLING, this.effects);
        this.levitation = this.ctx.getEffectLevel(CheapEffects.LEVITATION, this.effects);
        this.blindness = this.ctx.getEffectLevel(CheapEffects.BLINDNESS, this.effects);


        // armour enchantments: the boots and leggings in their inventory slots. prismarine-item reads them from the
        // nbt as { name, lvl }; from 1.20.5 its enchants are the enchantments component as sent, { enchantments: [{ id, level }] }
        type Enchants = { name: string; lvl: number }[] | { enchantments?: { id: number; level: number }[] };
        const enchantmentsOf = (slot: string) => {
            const enchants = (bot.inventory.slots[bot.getEquipmentDestSlot(slot)] as { enchants?: Enchants } | null | undefined)?.enchants;
            if (Array.isArray(enchants)) return enchants.map(({ name, lvl }) => ({ id: name, lvl }));
            return (enchants?.enchantments ?? []).map(({ id, level }) => ({ id, lvl: level }));
        };
        const boots = enchantmentsOf("feet");
        this.depthStrider = this.ctx.getEnchantmentLevel(CheapEnchantments.DEPTH_STRIDER, boots);
        this.soulSpeed = this.ctx.getEnchantmentLevel(CheapEnchantments.SOUL_SPEED, boots);
        this.swiftSneak = this.ctx.getEnchantmentLevel(CheapEnchantments.SWIFT_SNEAK, enchantmentsOf("legs"));

        // the pose the engine left on the bot (the client decides its own pose), else the synced one
        this.pose = (bot.entity as Entity & { pose?: PlayerPoses }).pose ?? getPose(bot.entity);
        this.gameMode = bot.game.gameMode;
        this.food = bot.food;

        // TODO:
        this.swimming = (bot.entity as any).swimming ?? false;
        this.sprinting = (bot.entity as any).sprinting ?? false; 
        this.crouching = (bot.entity as any).crouching ?? false;
        this.fallFlying = (bot.entity as any).fallFlying ?? (bot.entity as any).elytraFlying ?? false;

        // Abilities.getFlyingSpeed: the flying speed the server sent (ClientboundPlayerAbilitiesPacket), in every game mode
        this.flySpeed = (bot.entity as { abilities?: { flyingSpeed?: number } }).abilities?.flyingSpeed ?? Math.fround(0.05);
        switch (bot.game.gameMode) {
            case "creative":
                this.mayFly = true;
                break;
            case "spectator":
                this.mayFly = true;
                break;
            case "survival":
            case "adventure":
                this.mayFly = (bot.entity as any).canFly;
                break;
            default:
                throw new Error("Unknown game mode: " + bot.game.gameMode);
        }

        this.flying = !!(bot.entity as any).flying && this.mayFly


        return this;
    }

    public apply(bot: Bot): void {
        // const bot.entity = bot instanceof bot.entity ? bot : bot.entity;
        bot.entity.position.set(this.pos.x, this.pos.y, this.pos.z);
        bot.entity.velocity.set(this.vel.x, this.vel.y, this.vel.z);
        bot.entity.onGround = this.onGround;
        (bot.entity as any).lastOnGround = this.lastOnGround;
        (bot.entity as any).onClimbable = this.onClimbable;
        (bot.entity as any).isInWater = this.isInWater;
        (bot.entity as any).isUnderWater = this.isUnderWater;
        (bot.entity as { eyeInWater?: boolean }).eyeInWater = this.eyeInWater;
        (bot.entity as any).isInLava = this.isInLava;
        (bot.entity as any).isUnderLava = this.isUnderLava;
        (bot.entity as any).isInWeb = this.isInWeb;
        (bot.entity as any).elytraEquipped = this.validElytraEquipped;
        bot.fireworkRocketDuration = this.fireworkRocketDuration;
        (bot.entity as any).isCollidedHorizontally = this.isCollidedHorizontally;
        (bot.entity as any).isCollidedHorizontallyMinor = this.isCollidedHorizontallyMinor;
        (bot.entity as any).isCollidedVertically = this.isCollidedVertically;
        (bot.entity as any).supportingBlockPos = this.supportingBlockPos;
        (bot.entity as any).fallDistance = this.fallDistance;
        (bot.entity as { isInPowderSnow?: boolean }).isInPowderSnow = this.isInPowderSnow;

        // dunno what to do about these, ngl.
        (bot as any).jumpTicks = this.jumpTicks;
        (bot as any).jumpQueued = this.jumpQueued;
        (bot as any).flyJumpTriggerTime = this.flyJumpTriggerTime;
        (bot as any).sprintTriggerTime = this.sprintTriggerTime;
        (bot as unknown as { autoJumpTime?: number }).autoJumpTime = this.autoJumpTime;

        bot.entity.yaw = this.yaw;
        bot.entity.pitch = this.pitch;
        bot.entity.height = this.height;
        bot.entity.width = this.halfWidth * 2;
        (bot.entity as any).eyeHeight = this.eyeHeight;

        (bot.entity as Entity & { pose?: PlayerPoses }).pose = this.pose;
        bot.game.gameMode = this.gameMode; // this should never actually be in charge.
        bot.food = this.food; // this should also never actually be in charge.

        (bot.entity as any).flying = this.flying ?? false;
        (bot.entity as any).swimming = this.swimming ?? false;
        (bot.entity as any).sprinting = this.sprinting ?? false;
        (bot.entity as any).crouching = this.crouching ?? false;
        (bot.entity as any).fallFlying = this.fallFlying;
        bot.entity.elytraFlying = this.fallFlying;
        bot.entity.attributes = this.attributes;

        this.control.applyControls(bot);
        (bot.entity as any).prevControl = this.prevControl;
    }

    public clone() {
        const tmp = new PlayerState(this.ctx, this.bot, this.control);
        tmp.pos.set(this.pos.x, this.pos.y, this.pos.z);
        tmp.vel.set(this.vel.x, this.vel.y, this.vel.z);
        tmp.onGround = this.onGround;
        tmp.lastOnGround = this.lastOnGround;
        tmp.onClimbable = this.onClimbable;
        tmp.isInWater = this.isInWater;
        tmp.isUnderWater = this.isUnderWater;
        tmp.eyeInWater = this.eyeInWater;
        tmp.isInLava = this.isInLava;
        tmp.isUnderLava = this.isUnderLava;
        tmp.isInWeb = this.isInWeb;
        tmp.validElytraEquipped = this.validElytraEquipped;
        tmp.canWalkOnPowderSnow = this.canWalkOnPowderSnow;
        tmp.fireworkRocketDuration = this.fireworkRocketDuration;
        tmp.fireworkRockets = this.fireworkRockets;
        tmp.fireworkRocketsBeforePlayer = this.fireworkRocketsBeforePlayer;
        tmp.isCollidedHorizontally = this.isCollidedHorizontally;
        tmp.isCollidedHorizontallyMinor = this.isCollidedHorizontallyMinor;
        tmp.isCollidedVertically = this.isCollidedVertically;
        tmp.supportingBlockPos = this.supportingBlockPos;
        tmp.fallDistance = this.fallDistance;
        tmp.scale = this.scale;
        tmp.isInPowderSnow = this.isInPowderSnow;
        tmp.wasInPowderSnow = this.wasInPowderSnow;
        tmp.keptBoundingBox = this.keptBoundingBox;
        tmp.nearbyEntities = this.nearbyEntities;

        tmp.sneakCollision = false; //TODO

        //not sure what to do here, ngl.
        tmp.jumpTicks = this.jumpTicks ?? 0;
        tmp.jumpQueued = this.jumpQueued ?? false;
        tmp.flyJumpTriggerTime = this.flyJumpTriggerTime ?? 0;
        tmp.sprintTriggerTime = this.sprintTriggerTime ?? 0;
        tmp.prevForwardImpulse = this.prevForwardImpulse;
        tmp.autoJumpEnabled = this.autoJumpEnabled;
        tmp.autoJumpTime = this.autoJumpTime;

        // Input only (not modified)
        tmp.attributes = this.attributes;
        tmp.yaw = this.yaw;
        tmp.yawDegrees = this.yawDegrees;
        tmp.pitch = this.pitch;
        tmp.control = this.control.clone();
        tmp.prevControl = this.prevControl.clone();

        tmp.isUsingItem = this.isUsingItem;
        tmp.isUsingMainHand = this.isUsingMainHand;
        tmp.isUsingOffHand = this.isUsingOffHand;

        // effects
        tmp.effects = this.effects;
        tmp.statusEffectNames = this.statusEffectNames;

        tmp.jumpBoost = this.jumpBoost;
        tmp.speed = this.speed;
        tmp.slowness = this.slowness;

        tmp.dolphinsGrace = this.dolphinsGrace;
        tmp.slowFalling = this.slowFalling;
        tmp.levitation = this.levitation;
        tmp.blindness = this.blindness;
        tmp.soulSpeed = this.soulSpeed;
        tmp.swiftSneak = this.swiftSneak;
        tmp.depthStrider = this.depthStrider;

        tmp.pose = this.pose;
        tmp.gameMode = this.gameMode;

        tmp.flying = this.flying;
        tmp.swimming = this.swimming;
        tmp.sprinting = this.sprinting;
        tmp.crouching = this.crouching;
        tmp.fallFlying = this.fallFlying;

        tmp.food = this.food;


        return tmp;
    }


    public merge(other: PlayerState) {
        this.pos.set(other.pos.x, other.pos.y, other.pos.z);
        this.vel.set(other.vel.x, other.vel.y, other.vel.z);
        this.onGround = other.onGround;
        this.lastOnGround = other.lastOnGround;
        this.onClimbable = other.onClimbable;
        this.isInWater = other.isInWater;
        this.isUnderWater = other.isUnderWater;
        this.eyeInWater = other.eyeInWater;
        this.isInLava = other.isInLava;
        this.isUnderLava = other.isUnderLava;
        this.isInWeb = other.isInWeb;
        this.validElytraEquipped = other.validElytraEquipped;
        this.canWalkOnPowderSnow = other.canWalkOnPowderSnow;
        this.fireworkRocketDuration = other.fireworkRocketDuration;
        this.fireworkRockets = other.fireworkRockets;
        this.fireworkRocketsBeforePlayer = other.fireworkRocketsBeforePlayer;
        this.isCollidedHorizontally = other.isCollidedHorizontally;
        this.isCollidedHorizontallyMinor = other.isCollidedHorizontallyMinor
        this.isCollidedVertically = other.isCollidedVertically;
        this.supportingBlockPos = other.supportingBlockPos;
        this.fallDistance = other.fallDistance;
        this.scale = other.scale;
        this.isInPowderSnow = other.isInPowderSnow;
        this.wasInPowderSnow = other.wasInPowderSnow;
        this.keptBoundingBox = other.keptBoundingBox;
        this.nearbyEntities = other.nearbyEntities;

        this.sneakCollision = false; //TODO

        //not sure what to do here, ngl.
        this.jumpTicks = other.jumpTicks ?? 0;
        this.jumpQueued = other.jumpQueued ?? false;
        this.flyJumpTriggerTime = other.flyJumpTriggerTime ?? 0;
        this.sprintTriggerTime = other.sprintTriggerTime ?? 0;
        this.prevForwardImpulse = other.prevForwardImpulse ?? 0;
        this.autoJumpEnabled = other.autoJumpEnabled ?? false;
        this.autoJumpTime = other.autoJumpTime ?? 0;

        // Input only (not modified)
        this.attributes = other.attributes;
        this.yaw = other.yaw;
        this.pitch = other.pitch;
        this.control = other.control.clone();
        this.prevControl = other.prevControl.clone();

        this.isUsingItem = other.isUsingItem;
        this.isUsingMainHand = other.isUsingMainHand;
        this.isUsingOffHand = other.isUsingOffHand;

        // effects
        this.effects = other.effects;
        this.statusEffectNames = other.statusEffectNames;

        this.jumpBoost = other.jumpBoost;
        this.speed = other.speed;
        this.slowness = other.slowness;

        this.dolphinsGrace = other.dolphinsGrace;
        this.slowFalling = other.slowFalling;
        this.swiftSneak = other.swiftSneak;
        this.soulSpeed = other.soulSpeed;
        this.levitation = other.levitation;
        this.depthStrider = other.depthStrider;

        this.pose = other.pose;
        this.gameMode = other.gameMode;

        this.flying = other.flying;
        this.swimming = other.swimming;
        this.sprinting = other.sprinting;
        this.crouching = other.crouching;

        this.food = other.food;

        return this;

    }

    public getBB(): AABB {
        const w = this.halfWidth;
        return new AABB(
            this.pos.x - w,
            this.pos.y,
            this.pos.z - w,
            this.pos.x + w,
            this.pos.y + this.height,
            this.pos.z + w
        );
    }


    public lookAt(vec3: Vec3) {
        const dx = vec3.x - this.pos.x;
        const dy = vec3.y - this.pos.y;
        const dz = vec3.z - this.pos.z;

        this.yaw = Math.atan2(dz, dx) * 180 / Math.PI - 90;
        this.pitch = -Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * 180 / Math.PI;
        console.log(this.yaw, this.pitch);
    }

    public look(yaw: number, pitch:number) {
        this.yaw = yaw;
        this.pitch = pitch;
    }
}
export { ControlStateHandler };
