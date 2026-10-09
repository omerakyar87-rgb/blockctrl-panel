package dev.blockctrl.tracker;

import com.mojang.brigadier.arguments.StringArgumentType;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.RegisterCommandsEvent;
import net.minecraftforge.event.entity.EntityLeaveLevelEvent;
import net.minecraftforge.event.entity.item.ItemExpireEvent;
import net.minecraftforge.event.entity.item.ItemTossEvent;
import net.minecraftforge.event.entity.living.LivingDropsEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.UUID;

@Mod("blockctrl_tracker")
public final class BlockCtrlForge {
  private static final HttpClient HTTP = HttpClient.newHttpClient();
  private static final String OWNER_UUID = "BlockCtrlOwnerUuid";
  private static final String OWNER_NAME = "BlockCtrlOwnerName";
  private static final String SOURCE = "BlockCtrlSource";
  private static final String SERVER_ID = System.getenv().getOrDefault("BLOCKCTRL_SERVER_ID", "");
  private static final String ENDPOINT = System.getenv().getOrDefault("BLOCKCTRL_TRACKER_ENDPOINT", "http://127.0.0.1:8788/item-loss");
  private static final String TRACKER_TOKEN = System.getenv().getOrDefault("BLOCKCTRL_TRACKER_TOKEN", "");
  private static final String WEBSITE_REGISTER_ENDPOINT = System.getenv().getOrDefault("BLOCKCTRL_WEBSITE_REGISTER_ENDPOINT", "http://127.0.0.1:8788/website-register");
  private static final boolean TRACKING_ENABLED = !"0".equals(System.getenv().getOrDefault("BLOCKCTRL_TRACKING_ENABLED", "1"));

  public BlockCtrlForge() { MinecraftForge.EVENT_BUS.register(this); }


  @SubscribeEvent
  public void onCommands(RegisterCommandsEvent event) {
    event.getDispatcher().register(Commands.literal("register").then(Commands.argument("args", StringArgumentType.greedyString()).executes(context -> {
      ServerPlayer player = context.getSource().getPlayerOrException();
      String[] parts = StringArgumentType.getString(context, "args").trim().split("\\s+", 2);
      if (parts.length == 0 || parts[0].length() < 8) { player.sendSystemMessage(Component.literal("Kullanım: /register <en-az-8-karakter-şifre> [email]")); return 0; }
      registerWebsiteAccount(player, parts[0], parts.length > 1 ? parts[1] : "");
      player.sendSystemMessage(Component.literal("BlockCtrl website hesabı oluşturuluyor..."));
      return 1;
    })));
  }

  private static void registerWebsiteAccount(ServerPlayer player, String password, String email) {
    if (SERVER_ID.isBlank() || TRACKER_TOKEN.isBlank()) { player.sendSystemMessage(Component.literal("BlockCtrl tracker kimliği eksik.")); return; }
    String json = "{\"minecraftUsername\":" + q(player.getGameProfile().getName()) + ",\"playerUuid\":" + q(player.getUUID().toString()) + ",\"name\":" + q(player.getGameProfile().getName()) + ",\"password\":" + q(password) + ",\"email\":" + q(email) + "}";
    try {
      HttpRequest request = HttpRequest.newBuilder(URI.create(WEBSITE_REGISTER_ENDPOINT)).header("content-type", "application/json").header("x-blockctrl-server-id", SERVER_ID).header("x-blockctrl-tracker-token", TRACKER_TOKEN).POST(HttpRequest.BodyPublishers.ofString(json)).build();
      HTTP.sendAsync(request, HttpResponse.BodyHandlers.ofString()).whenComplete((response, error) -> player.getServer().execute(() -> {
        if (error != null) player.sendSystemMessage(Component.literal("Website hesabı oluşturulamadı: agent bağlantısı başarısız."));
        else if (response.statusCode() >= 200 && response.statusCode() < 300) player.sendSystemMessage(Component.literal("Website hesabınız oluşturuldu. Artık siteden giriş yapabilirsiniz."));
        else if (response.statusCode() == 409) player.sendSystemMessage(Component.literal("Bu Minecraft hesabı veya e-posta zaten website'e kayıtlı."));
        else player.sendSystemMessage(Component.literal("Website hesabı oluşturulamadı (HTTP " + response.statusCode() + ")."));
      }));
    } catch (Exception error) { player.sendSystemMessage(Component.literal("Website kayıt endpoint'i geçersiz.")); }
  }

  @SubscribeEvent
  public void onToss(ItemTossEvent event) {
    Player player = event.getPlayer();
    ItemEntity item = event.getEntity();
    if (player.level().isClientSide) return;
    remember(item, new Owner(player.getUUID().toString(), player.getName().getString()), "manual-drop");
  }

  @SubscribeEvent
  public void onDeathDrops(LivingDropsEvent event) {
    if (!(event.getEntity() instanceof Player player) || player.level().isClientSide) return;
    Owner owner = new Owner(player.getUUID().toString(), player.getName().getString());
    for (ItemEntity item : event.getDrops()) if (!item.getItem().isEmpty()) remember(item, owner, "death-drop");
  }

  @SubscribeEvent
  public void onExpire(ItemExpireEvent event) {
    ItemEntity item = event.getEntity();
    Owner owner = owner(item);
    if (owner == null) return;
    String src = source(item);
    send(item, owner, "despawn", src, "age-expired");
    clear(item);
  }

  @SubscribeEvent
  public void onLeave(EntityLeaveLevelEvent event) {
    if (!(event.getEntity() instanceof ItemEntity item) || event.getLevel().isClientSide) return;
    Owner owner = owner(item);
    if (owner == null) return;
    Entity.RemovalReason removal = item.getRemovalReason();
    if (removal == null) return;
    String removalName = removal.name();
    if (!removalName.contains("KILLED")) return; // pickups, merges, chunk unloads are not losses
    String src = source(item);
    String reason = item.isInLava() ? "lava" : item.isOnFire() ? "fire" : "destroyed";
    send(item, owner, reason, src, removalName);
    clear(item);
  }

  private static void remember(ItemEntity item, Owner owner, String source) {
    CompoundTag tag = item.getPersistentData();
    tag.putString(OWNER_UUID, owner.uuid());
    tag.putString(OWNER_NAME, owner.name());
    tag.putString(SOURCE, source);
  }

  private static Owner owner(ItemEntity item) {
    CompoundTag tag = item.getPersistentData();
    if (!tag.contains(OWNER_UUID)) return null;
    String uuid = tag.getString(OWNER_UUID);
    if (uuid.isBlank()) return null;
    return new Owner(uuid, tag.getString(OWNER_NAME));
  }

  private static String source(ItemEntity item) {
    String value = item.getPersistentData().getString(SOURCE);
    return value.isBlank() ? "manual-drop" : value;
  }

  private static void clear(ItemEntity item) {
    CompoundTag tag = item.getPersistentData();
    tag.remove(OWNER_UUID); tag.remove(OWNER_NAME); tag.remove(SOURCE);
  }

  private static void send(ItemEntity item, Owner owner, String reason, String source, String detail) {
    if (!TRACKING_ENABLED) return;
    if (SERVER_ID.isBlank() || TRACKER_TOKEN.isBlank() || item.getItem().isEmpty() || item.level().isClientSide) return;
    ItemStack stack = item.getItem();
    String json = "{\"eventId\":" + q(UUID.randomUUID().toString())
      + ",\"playerUuid\":" + q(owner.uuid()) + ",\"playerName\":" + q(owner.name())
      + ",\"itemId\":" + q(BuiltInRegistries.ITEM.getKey(stack.getItem()).toString())
      + ",\"itemName\":" + q(stack.getHoverName().getString()) + ",\"amount\":" + stack.getCount()
      + ",\"reason\":" + q(reason) + ",\"world\":" + q(item.level().dimension().location().toString())
      + ",\"x\":" + (int)Math.floor(item.getX()) + ",\"y\":" + (int)Math.floor(item.getY()) + ",\"z\":" + (int)Math.floor(item.getZ())
      + ",\"occurredAt\":" + q(Instant.now().toString())
      + ",\"metadata\":{\"sourceLoader\":\"forge\",\"trackingMode\":\"event-adapter\",\"source\":" + q(source) + ",\"detail\":" + q(detail) + "}}";
    try {
      HttpRequest request = HttpRequest.newBuilder(URI.create(ENDPOINT))
        .header("content-type", "application/json")
        .header("x-blockctrl-server-id", SERVER_ID)
        .header("x-blockctrl-tracker-token", TRACKER_TOKEN)
        .POST(HttpRequest.BodyPublishers.ofString(json)).build();
      HTTP.sendAsync(request, HttpResponse.BodyHandlers.discarding()).exceptionally(error -> null);
    } catch (Exception ignored) { }
  }

  private static String q(String value) { return value == null ? "null" : "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r") + "\""; }
  private record Owner(String uuid, String name) { }
}
