package ru.stoloto.balloon.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** Аккаунт: учётные данные, баланс бонусных баллов и накопленные игровые очки. */
@Entity
@Table(name = "players")
public class PlayerEntity {

    public static final String ROLE_ADMIN = "ADMIN";
    public static final String ROLE_PLAYER = "PLAYER";

    @Id
    private String id;

    /** Логин. Хранится в нижнем регистре — вход не должен зависеть от раскладки Caps Lock. */
    @Column(nullable = false, unique = true, length = 32)
    private String username;

    @Column(nullable = false)
    private String passwordHash;

    /** Имя для таблицы участников и истории игр. */
    @Column(nullable = false, length = 64)
    private String displayName;

    @Column(nullable = false, length = 16)
    private String role;

    private int balance;
    private int totalPoints;
    private Instant createdAt;

    protected PlayerEntity() {
        // для JPA
    }

    public PlayerEntity(String username, String passwordHash, String displayName,
                        String role, int balance) {
        this.id = UUID.randomUUID().toString();
        this.username = username;
        this.passwordHash = passwordHash;
        this.displayName = displayName;
        this.role = role;
        this.balance = balance;
        this.totalPoints = 0;
        this.createdAt = Instant.now();
    }

    public String getId() { return id; }
    public String getUsername() { return username; }
    public String getPasswordHash() { return passwordHash; }
    public String getDisplayName() { return displayName; }
    public String getRole() { return role; }
    public int getBalance() { return balance; }
    public int getTotalPoints() { return totalPoints; }
    public Instant getCreatedAt() { return createdAt; }

    public boolean isAdmin() {
        return ROLE_ADMIN.equals(role);
    }

    public void withdraw(int amount) {
        this.balance -= amount;
    }

    public void deposit(int amount) {
        this.balance += amount;
    }

    public void addPoints(int amount) {
        this.totalPoints += amount;
    }
}
