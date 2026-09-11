package ru.stoloto.balloon.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Игрок. В прототипе он один — демо-пользователь "guest" (см. docs/api.md),
 * поэтому отдельного auth-слоя нет.
 */
@Entity
@Table(name = "players")
public class PlayerEntity {

    @Id
    private String id;

    private int balance;
    private int totalPoints;

    protected PlayerEntity() {
        // для JPA
    }

    public PlayerEntity(String id, int balance) {
        this.id = id;
        this.balance = balance;
        this.totalPoints = 0;
    }

    public String getId() { return id; }
    public int getBalance() { return balance; }
    public int getTotalPoints() { return totalPoints; }

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
