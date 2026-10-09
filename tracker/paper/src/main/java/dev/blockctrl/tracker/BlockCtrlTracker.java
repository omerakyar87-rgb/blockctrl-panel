package dev.blockctrl.tracker;

import org.bukkit.Location;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.NamespacedKey;
import org.bukkit.entity.Item;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.EntityPickupItemEvent;
import org.bukkit.event.entity.ItemDespawnEvent;
import org.bukkit.event.entity.ItemMergeEvent;
import org.bukkit.event.entity.ItemSpawnEvent;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.inventory.InventoryPickupItemEvent;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.java.JavaPlugin;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class BlockCtrlTracker extends JavaPlugin implements Listener {
  private NamespacedKey ownerId;
  private NamespacedKey ownerName;
  private NamespacedKey source;
  private String serverId;
  private String endpoint;
  private String trackerToken;
  private String websiteRegisterEndpoint;
  private boolean trackingEnabled;
  private final HttpClient client = HttpClient.newHttpClient();
  private final Map<UUID, PendingDeath> pendingDeaths = new ConcurrentHashMap<>();

  @Override public void onEnable() {
    saveDefaultConfig();
    serverId = System.getenv().getOrDefault("BLOCKCTRL_SERVER_ID", getConfig().getString("server-id", ""));
    endpoint = System.getenv().getOrDefault("BLOCKCTRL_TRACKER_ENDPOINT", getConfig().getString("endpoint", "http://127.0.0.1:8788/item-loss"));
    trackerToken = System.getenv().getOrDefault("BLOCKCTRL_TRACKER_TOKEN", "");
    websiteRegisterEndpoint = System.getenv().getOrDefault("BLOCKCTRL_WEBSITE_REGISTER_ENDPOINT", "http://127.0.0.1:8788/website-register");
    trackingEnabled = !"0".equals(System.getenv().getOrDefault("BLOCKCTRL_TRACKING_ENABLED", "1"));
    ownerId = new NamespacedKey(this, "owner_uuid");
    ownerName = new NamespacedKey(this, "owner_name");
    source = new NamespacedKey(this, "source");
    if (serverId == null || serverId.isBlank() || trackerToken.isBlank()) {
      getLogger().severe("BlockCtrl tracker kimliği eksik; tracker devre dışı bırakıldı.");
      getServer().getPluginManager().disablePlugin(this);
      return;
    }
    if (trackingEnabled) {
      getServer().getPluginManager().registerEvents(this, this);
      getLogger().info("BlockCtrl lost-item tracker enabled for Bukkit/Paper-compatible server.");
    } else {
      getLogger().info("BlockCtrl website /register bridge enabled; lost-item tracking disabled.");
    }
  }


  @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
    if (!command.getName().equalsIgnoreCase("register")) return false;
    if (!(sender instanceof Player player)) { sender.sendMessage("Bu komut yalnız oyuncular içindir."); return true; }
    if (args.length < 1 || args[0].length() < 8) { player.sendMessage("Kullanım: /register <en-az-8-karakter-şifre> [email]"); return true; }
    String email = args.length > 1 ? args[1].trim() : "";
    registerWebsiteAccount(player, args[0], email);
    player.sendMessage("BlockCtrl website hesabı oluşturuluyor...");
    return true;
  }

  private void registerWebsiteAccount(Player player, String password, String email) {
    String json = "{\"minecraftUsername\":" + q(player.getName()) + ",\"playerUuid\":" + q(player.getUniqueId().toString()) + ",\"name\":" + q(player.getName()) + ",\"password\":" + q(password) + ",\"email\":" + q(email) + "}";
    try {
      HttpRequest request = HttpRequest.newBuilder(URI.create(websiteRegisterEndpoint))
        .header("content-type", "application/json")
        .header("x-blockctrl-server-id", serverId)
        .header("x-blockctrl-tracker-token", trackerToken)
        .POST(HttpRequest.BodyPublishers.ofString(json)).build();
      client.sendAsync(request, HttpResponse.BodyHandlers.ofString()).whenComplete((response, error) ->
        getServer().getScheduler().runTask(this, () -> {
          if (!player.isOnline()) return;
          if (error != null) { player.sendMessage("Website hesabı oluşturulamadı: agent bağlantısı başarısız."); return; }
          if (response.statusCode() >= 200 && response.statusCode() < 300) player.sendMessage("Website hesabınız oluşturuldu. Artık siteden giriş yapabilirsiniz.");
          else if (response.statusCode() == 409) player.sendMessage("Bu Minecraft hesabı veya e-posta zaten website'e kayıtlı.");
          else player.sendMessage("Website hesabı oluşturulamadı (HTTP " + response.statusCode() + ").");
        })
      );
    } catch (Exception error) { player.sendMessage("Website kayıt endpoint'i geçersiz."); }
  }

  @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
  public void onDrop(PlayerDropItemEvent event) {
    tag(event.getItemDrop(), event.getPlayer().getUniqueId().toString(), event.getPlayer().getName(), "manual-drop");
  }

  @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
  public void onDeath(PlayerDeathEvent event) {
    if (event.getKeepInventory() || event.getDrops().isEmpty()) return;
    List<ItemStack> expected = new ArrayList<>();
    for (ItemStack stack : event.getDrops()) if (stack != null && stack.getAmount() > 0) expected.add(stack.clone());
    if (expected.isEmpty()) return;
    UUID playerId = event.getEntity().getUniqueId();
    PendingDeath pending = new PendingDeath(playerId.toString(), event.getEntity().getName(), event.getEntity().getLocation().clone(), expected, System.currentTimeMillis() + 2500L);
    pendingDeaths.put(playerId, pending);
    getServer().getScheduler().runTaskLater(this, () -> pendingDeaths.remove(playerId, pending), 50L);
  }

  @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
  public void onSpawn(ItemSpawnEvent event) {
    Item item = event.getEntity();
    Location location = item.getLocation();
    long now = System.currentTimeMillis();
    for (Map.Entry<UUID, PendingDeath> entry : pendingDeaths.entrySet()) {
      PendingDeath pending = entry.getValue();
      if (pending.expiresAt < now) { pendingDeaths.remove(entry.getKey(), pending); continue; }
      if (pending.location.getWorld() == null || location.getWorld() == null || !pending.location.getWorld().equals(location.getWorld()) || pending.location.distanceSquared(location) > 25.0) continue;
      synchronized (pending.remaining) {
        ItemStack actual = item.getItemStack();
        for (int index = 0; index < pending.remaining.size(); index++) {
          ItemStack expected = pending.remaining.get(index);
          if (!expected.isSimilar(actual)) continue;
          tag(item, pending.playerUuid, pending.playerName, "death-drop");
          int left = expected.getAmount() - actual.getAmount();
          if (left > 0) expected.setAmount(left); else pending.remaining.remove(index);
          if (pending.remaining.isEmpty()) pendingDeaths.remove(entry.getKey(), pending);
          return;
        }
      }
    }
  }

  @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
  public void onPickup(EntityPickupItemEvent event) {
    if (!hasOwner(event.getItem())) return;
    if (event.getRemaining() <= 0) clearOwner(event.getItem());
  }

  @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
  public void onInventoryPickup(InventoryPickupItemEvent event) {
    if (hasOwner(event.getItem())) clearOwner(event.getItem());
  }

  @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
  public void onMerge(ItemMergeEvent event) {
    Item sourceItem = event.getEntity();
    Item targetItem = event.getTarget();
    boolean sourceTracked = hasOwner(sourceItem);
    boolean targetTracked = hasOwner(targetItem);
    if (!sourceTracked) return;
    if (targetTracked) {
      String sourceOwner = sourceItem.getPersistentDataContainer().get(ownerId, PersistentDataType.STRING);
      String targetOwner = targetItem.getPersistentDataContainer().get(ownerId, PersistentDataType.STRING);
      if (sourceOwner != null && targetOwner != null && !sourceOwner.equals(targetOwner)) event.setCancelled(true);
      return;
    }
    copyOwner(sourceItem, targetItem);
  }

  @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
  public void onDespawn(ItemDespawnEvent event) {
    Item item = event.getEntity();
    if (!hasOwner(item)) return;
    sendTracked(item, "despawn", "age-expired");
    clearOwner(item);
  }

  @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
  public void onDamage(EntityDamageEvent event) {
    if (!(event.getEntity() instanceof Item item) || !hasOwner(item)) return;
    String reason = switch (event.getCause()) {
      case LAVA -> "lava";
      case FIRE, FIRE_TICK -> "fire";
      case CONTACT -> "cactus";
      case BLOCK_EXPLOSION, ENTITY_EXPLOSION -> "explosion";
      case VOID -> "void";
      default -> null;
    };
    if (reason == null) return;
    getServer().getScheduler().runTask(this, () -> {
      if (!item.isValid() || item.isDead()) {
        sendTracked(item, reason, event.getCause().name());
        clearOwner(item);
      }
    });
  }

  private void tag(Item item, String uuid, String name, String eventSource) {
    PersistentDataContainer data = item.getPersistentDataContainer();
    data.set(ownerId, PersistentDataType.STRING, uuid);
    data.set(ownerName, PersistentDataType.STRING, name);
    data.set(source, PersistentDataType.STRING, eventSource);
  }

  private boolean hasOwner(Item item) {
    return item.getPersistentDataContainer().has(ownerId, PersistentDataType.STRING);
  }

  private void copyOwner(Item from, Item to) {
    PersistentDataContainer a = from.getPersistentDataContainer();
    PersistentDataContainer b = to.getPersistentDataContainer();
    String id = a.get(ownerId, PersistentDataType.STRING);
    if (id == null) return;
    b.set(ownerId, PersistentDataType.STRING, id);
    String name = a.get(ownerName, PersistentDataType.STRING);
    if (name != null) b.set(ownerName, PersistentDataType.STRING, name);
    String src = a.get(source, PersistentDataType.STRING);
    if (src != null) b.set(source, PersistentDataType.STRING, src);
  }

  private void clearOwner(Item item) {
    PersistentDataContainer data = item.getPersistentDataContainer();
    data.remove(ownerId);
    data.remove(ownerName);
    data.remove(source);
  }

  private void sendTracked(Item entity, String reason, String detail) {
    PersistentDataContainer data = entity.getPersistentDataContainer();
    sendStack(
      entity.getItemStack(), entity.getLocation(),
      data.get(ownerId, PersistentDataType.STRING), data.get(ownerName, PersistentDataType.STRING),
      reason, data.getOrDefault(source, PersistentDataType.STRING, "manual-drop"), detail
    );
  }

  private void sendStack(ItemStack stack, Location location, String playerUuid, String playerName, String reason, String eventSource, String detail) {
    if (!trackingEnabled) return;
    if (serverId == null || serverId.isBlank() || trackerToken.isBlank() || stack == null || stack.getAmount() <= 0 || location.getWorld() == null) return;
    String metadata = "{\"sourceLoader\":\"paper\",\"trackingMode\":\"event-adapter\",\"source\":" + q(eventSource)
      + (detail == null ? "" : ",\"detail\":" + q(detail)) + "}";
    String json = "{\"eventId\":" + q(UUID.randomUUID().toString())
      + ",\"playerUuid\":" + q(playerUuid)
      + ",\"playerName\":" + q(playerName)
      + ",\"itemId\":" + q(stack.getType().getKey().toString())
      + ",\"itemName\":" + q(stack.getType().translationKey())
      + ",\"amount\":" + stack.getAmount()
      + ",\"reason\":" + q(reason)
      + ",\"world\":" + q(location.getWorld().getKey().toString())
      + ",\"x\":" + location.getBlockX() + ",\"y\":" + location.getBlockY() + ",\"z\":" + location.getBlockZ()
      + ",\"occurredAt\":" + q(Instant.now().toString())
      + ",\"metadata\":" + metadata + "}";
    try {
      HttpRequest request = HttpRequest.newBuilder(URI.create(endpoint))
        .header("content-type", "application/json")
        .header("x-blockctrl-server-id", serverId)
        .header("x-blockctrl-tracker-token", trackerToken)
        .POST(HttpRequest.BodyPublishers.ofString(json)).build();
      client.sendAsync(request, HttpResponse.BodyHandlers.discarding())
        .exceptionally(error -> { getLogger().warning("Item loss could not be queued: " + error.getMessage()); return null; });
    } catch (Exception error) {
      getLogger().warning("Invalid tracker endpoint: " + error.getMessage());
    }
  }

  private static String q(String value) {
    return value == null ? "null" : "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r") + "\"";
  }

  private static final class PendingDeath {
    final String playerUuid;
    final String playerName;
    final Location location;
    final List<ItemStack> remaining;
    final long expiresAt;
    PendingDeath(String playerUuid, String playerName, Location location, List<ItemStack> remaining, long expiresAt) {
      this.playerUuid = playerUuid;
      this.playerName = playerName;
      this.location = location;
      this.remaining = remaining;
      this.expiresAt = expiresAt;
    }
  }
}
