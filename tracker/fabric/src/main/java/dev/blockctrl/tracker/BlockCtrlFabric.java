package dev.blockctrl.tracker;

import net.fabricmc.api.ModInitializer;
import com.mojang.brigadier.arguments.StringArgumentType;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.server.command.CommandManager;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.entity.Entity;
import net.minecraft.entity.ItemEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.registry.Registries;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class BlockCtrlFabric implements ModInitializer {
  private static final HttpClient HTTP = HttpClient.newHttpClient();
  private static final String SERVER_ID = System.getenv().getOrDefault("BLOCKCTRL_SERVER_ID", "");
  private static final String ENDPOINT = System.getenv().getOrDefault("BLOCKCTRL_TRACKER_ENDPOINT", "http://127.0.0.1:8788/item-loss");
  private static final String TOKEN = System.getenv().getOrDefault("BLOCKCTRL_TRACKER_TOKEN", "");
  private static final String WEBSITE_REGISTER_ENDPOINT = System.getenv().getOrDefault("BLOCKCTRL_WEBSITE_REGISTER_ENDPOINT", "http://127.0.0.1:8788/website-register");
  private static final boolean TRACKING_ENABLED = !"0".equals(System.getenv().getOrDefault("BLOCKCTRL_TRACKING_ENABLED", "1"));
  private static final String OWNER_UUID = "BlockCtrlOwnerUuid";
  private static final String OWNER_NAME = "BlockCtrlOwnerName";
  private static final String SOURCE = "BlockCtrlSource";
  private static final ConcurrentHashMap<UUID, Owner> OWNERS = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<UUID, String> SOURCES = new ConcurrentHashMap<>();
  private static final Set<UUID> SUPPRESSED_REMOVAL = ConcurrentHashMap.newKeySet();

  @Override public void onInitialize() {
    if (SERVER_ID.isBlank() || TOKEN.isBlank()) {
      System.err.println("[BlockCtrlTracker] tracker identity missing; event adapter will not emit records");
    }
    CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> dispatcher.register(
      CommandManager.literal("register").then(CommandManager.argument("args", StringArgumentType.greedyString()).executes(context -> {
        ServerPlayerEntity player = context.getSource().getPlayer();
        if (player == null) { context.getSource().sendError(Text.literal("Bu komut yalnız oyuncular içindir.")); return 0; }
        String[] parts = StringArgumentType.getString(context, "args").trim().split("\\s+", 2);
        if (parts.length == 0 || parts[0].length() < 8) { player.sendMessage(Text.literal("Kullanım: /register <en-az-8-karakter-şifre> [email]"), false); return 0; }
        registerWebsiteAccount(player, parts[0], parts.length > 1 ? parts[1] : "");
        player.sendMessage(Text.literal("BlockCtrl website hesabı oluşturuluyor..."), false);
        return 1;
      }))
    ));
  }


  private static void registerWebsiteAccount(ServerPlayerEntity player, String password, String email) {
    if (SERVER_ID.isBlank() || TOKEN.isBlank()) { player.sendMessage(Text.literal("BlockCtrl tracker kimliği eksik."), false); return; }
    String json = "{\"minecraftUsername\":" + q(player.getName().getString()) + ",\"playerUuid\":" + q(player.getUuidAsString()) + ",\"name\":" + q(player.getName().getString()) + ",\"password\":" + q(password) + ",\"email\":" + q(email) + "}";
    try {
      HttpRequest request = HttpRequest.newBuilder(URI.create(WEBSITE_REGISTER_ENDPOINT)).header("content-type", "application/json").header("x-blockctrl-server-id", SERVER_ID).header("x-blockctrl-tracker-token", TOKEN).POST(HttpRequest.BodyPublishers.ofString(json)).build();
      HTTP.sendAsync(request, HttpResponse.BodyHandlers.ofString()).whenComplete((response, error) -> player.getServer().execute(() -> {
        if (error != null) player.sendMessage(Text.literal("Website hesabı oluşturulamadı: agent bağlantısı başarısız."), false);
        else if (response.statusCode() >= 200 && response.statusCode() < 300) player.sendMessage(Text.literal("Website hesabınız oluşturuldu. Artık siteden giriş yapabilirsiniz."), false);
        else if (response.statusCode() == 409) player.sendMessage(Text.literal("Bu Minecraft hesabı veya e-posta zaten website'e kayıtlı."), false);
        else player.sendMessage(Text.literal("Website hesabı oluşturulamadı (HTTP " + response.statusCode() + ")."), false);
      }));
    } catch (Exception error) { player.sendMessage(Text.literal("Website kayıt endpoint'i geçersiz."), false); }
  }

  public static void remember(ItemEntity item, PlayerEntity player, String source) {
    remember(item, new Owner(player.getUuidAsString(), player.getName().getString()), source);
  }

  public static void remember(ItemEntity item, Owner owner, String source) {
    if (!TRACKING_ENABLED || item == null || owner == null) return;
    OWNERS.put(item.getUuid(), owner);
    SOURCES.put(item.getUuid(), source == null || source.isBlank() ? "manual-drop" : source);
  }

  public static Owner owner(ItemEntity item) { return item == null ? null : OWNERS.get(item.getUuid()); }
  public static String source(ItemEntity item) { return item == null ? "manual-drop" : SOURCES.getOrDefault(item.getUuid(), "manual-drop"); }
  public static void clear(ItemEntity item) { if (item != null) { OWNERS.remove(item.getUuid()); SOURCES.remove(item.getUuid()); } }
  public static void suppress(ItemEntity item) { if (item != null) SUPPRESSED_REMOVAL.add(item.getUuid()); }
  public static void unsuppress(ItemEntity item) { if (item != null) SUPPRESSED_REMOVAL.remove(item.getUuid()); }
  public static boolean suppressed(ItemEntity item) { return item != null && SUPPRESSED_REMOVAL.contains(item.getUuid()); }

  public static boolean prepareMerge(ItemEntity a, ItemEntity b) {
    Owner ao = owner(a), bo = owner(b);
    if (ao != null && bo != null && !ao.uuid().equals(bo.uuid())) return false;
    if (ao != null && bo == null) remember(b, ao, source(a));
    if (bo != null && ao == null) remember(a, bo, source(b));
    suppress(a); suppress(b);
    return true;
  }

  public static void finishMerge(ItemEntity a, ItemEntity b) {
    unsuppress(a); unsuppress(b);
    if (a != null && a.isRemoved()) clear(a);
    if (b != null && b.isRemoved()) clear(b);
  }

  public static void onDiscard(ItemEntity item) {
    if (item == null || suppressed(item)) return;
    Owner owner = owner(item);
    if (owner == null) return;
    ItemStack stack = item.getStack();
    if (stack.isEmpty()) { clear(item); return; }
    String reason = item.getItemAge() >= 5999 ? "despawn" : item.isInLava() ? "lava" : item.isOnFire() ? "fire" : "destroyed";
    emit(item, owner, reason);
    clear(item);
  }

  public static void writeTrackingNbt(ItemEntity item, NbtCompound nbt) {
    Owner owner = owner(item);
    if (owner == null) return;
    nbt.putString(OWNER_UUID, owner.uuid());
    nbt.putString(OWNER_NAME, owner.name());
    nbt.putString(SOURCE, source(item));
  }

  public static void readTrackingNbt(ItemEntity item, NbtCompound nbt) {
    if (!nbt.contains(OWNER_UUID)) return;
    String uuid = nbt.getString(OWNER_UUID);
    if (uuid == null || uuid.isBlank()) return;
    String name = nbt.getString(OWNER_NAME);
    String source = nbt.getString(SOURCE);
    remember(item, new Owner(uuid, name == null ? "" : name), source);
  }

  private static void emit(ItemEntity item, Owner owner, String reason) {
    if (!TRACKING_ENABLED) return;
    if (SERVER_ID.isBlank() || TOKEN.isBlank() || item == null || owner == null || item.getWorld().isClient()) return;
    ItemStack stack = item.getStack();
    if (stack.isEmpty()) return;
    String itemId = Registries.ITEM.getId(stack.getItem()).toString();
    String world = item.getWorld().getRegistryKey().getValue().toString();
    String json = "{\"eventId\":" + q(UUID.randomUUID().toString())
      + ",\"playerUuid\":" + q(owner.uuid()) + ",\"playerName\":" + q(owner.name())
      + ",\"itemId\":" + q(itemId) + ",\"itemName\":" + q(stack.getName().getString())
      + ",\"amount\":" + stack.getCount() + ",\"reason\":" + q(reason) + ",\"world\":" + q(world)
      + ",\"x\":" + (int)Math.floor(item.getX()) + ",\"y\":" + (int)Math.floor(item.getY()) + ",\"z\":" + (int)Math.floor(item.getZ())
      + ",\"occurredAt\":" + q(Instant.now().toString())
      + ",\"metadata\":{\"sourceLoader\":\"fabric\",\"trackingMode\":\"event-adapter\",\"source\":" + q(source(item)) + "}}";
    try {
      HttpRequest request = HttpRequest.newBuilder(URI.create(ENDPOINT))
        .header("content-type", "application/json")
        .header("x-blockctrl-server-id", SERVER_ID)
        .header("x-blockctrl-tracker-token", TOKEN)
        .POST(HttpRequest.BodyPublishers.ofString(json)).build();
      HTTP.sendAsync(request, HttpResponse.BodyHandlers.discarding()).exceptionally(error -> null);
    } catch (Exception ignored) { }
  }

  private static String q(String value) { return value == null ? "null" : "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r") + "\""; }
  public record Owner(String uuid, String name) { }
}
